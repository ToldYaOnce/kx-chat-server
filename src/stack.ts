import { Stack, Duration } from 'aws-cdk-lib';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ChatStackProps } from './types';
import { createMessagesTable } from './dynamodb/messagesTable';
import { createConnectionsTable } from './dynamodb/connectionsTable';
import { createResponderTopic } from './sns/responderTopic';
import * as path from 'path';

export class ChatInfraStack extends Stack {
  public readonly webSocketApi: WebSocketApi;
  public readonly messagesTable: any;
  public readonly connectionsTable: any;
  public readonly responderTopic: any;
  public readonly connectFunction: Function;
  public readonly disconnectFunction: Function;
  public readonly messageSendFunction: Function;
  public readonly postToConnectionFunction: Function;

  constructor(scope: Construct, id: string, props: ChatStackProps) {
    super(scope, id, props);

    const { snsTopicName, messageRetentionDays = 90 } = props;

    // Create DynamoDB tables
    this.messagesTable = createMessagesTable(this, messageRetentionDays);
    this.connectionsTable = createConnectionsTable(this);

    // Create SNS topic
    this.responderTopic = createResponderTopic(this, snsTopicName);

    // Create Lambda functions
    this.connectFunction = new Function(this, 'ConnectFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'connect.handler',
      code: Code.fromAsset(path.join(__dirname, 'lambda')),
      environment: {
        CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
      },
      timeout: Duration.seconds(30),
    });

    this.disconnectFunction = new Function(this, 'DisconnectFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'disconnect.handler',
      code: Code.fromAsset(path.join(__dirname, 'lambda')),
      environment: {
        CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
      },
      timeout: Duration.seconds(30),
    });

    this.messageSendFunction = new Function(this, 'MessageSendFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'messageSend.handler',
      code: Code.fromAsset(path.join(__dirname, 'lambda')),
      environment: {
        CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
        MESSAGES_TABLE_NAME: this.messagesTable.tableName,
        SNS_TOPIC_ARN: this.responderTopic.topicArn,
        MESSAGE_RETENTION_DAYS: messageRetentionDays.toString(),
      },
      timeout: Duration.seconds(30),
    });

    this.postToConnectionFunction = new Function(this, 'PostToConnectionFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'postToConnection.handler',
      code: Code.fromAsset(path.join(__dirname, 'lambda')),
      environment: {
        CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
        MESSAGES_TABLE_NAME: this.messagesTable.tableName,
        MESSAGE_RETENTION_DAYS: messageRetentionDays.toString(),
      },
      timeout: Duration.seconds(30),
    });

    // Grant DynamoDB permissions
    this.connectionsTable.grantReadWriteData(this.connectFunction);
    this.connectionsTable.grantReadWriteData(this.disconnectFunction);
    this.connectionsTable.grantReadWriteData(this.messageSendFunction);
    this.connectionsTable.grantReadWriteData(this.postToConnectionFunction);

    this.messagesTable.grantReadWriteData(this.messageSendFunction);
    this.messagesTable.grantReadWriteData(this.postToConnectionFunction);

    // Grant SNS permissions
    this.responderTopic.grantPublish(this.messageSendFunction);

    // Create WebSocket API
    this.webSocketApi = new WebSocketApi(this, 'WebSocketApi', {
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ConnectIntegration', this.connectFunction),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectIntegration', this.disconnectFunction),
      },
    });

    // Add custom route for message.send
    this.webSocketApi.addRoute('message.send', {
      integration: new WebSocketLambdaIntegration('MessageSendIntegration', this.messageSendFunction),
    });

    // Create stage
    const stage = new WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Add WebSocket API permissions to postToConnection function
    this.postToConnectionFunction.addEnvironment('WEBSOCKET_API_ID', this.webSocketApi.apiId);
    this.postToConnectionFunction.addEnvironment('STAGE', stage.stageName);

    this.postToConnectionFunction.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['execute-api:PostToConnection'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${stage.stageName}/POST/@connections/*`,
      ],
    }));

    // Grant API Gateway permissions to all Lambda functions
    [this.connectFunction, this.disconnectFunction, this.messageSendFunction].forEach(fn => {
      fn.addToRolePolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['execute-api:PostToConnection'],
        resources: [
          `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${stage.stageName}/POST/@connections/*`,
        ],
      }));
    });
  }
}