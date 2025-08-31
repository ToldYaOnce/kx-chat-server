import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { ChatMessage, MessageSendPayload, SNSMessagePayload, Connection } from '../types';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('Message send event:', JSON.stringify(event, null, 2));

  const { connectionId } = event.requestContext;

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing message body' }),
      };
    }

    const payload: MessageSendPayload = JSON.parse(event.body);
    
    if (payload.action !== 'message.send') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid action' }),
      };
    }

    if (!payload.threadId || !payload.text || !payload.sender) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: threadId, text, sender' }),
      };
    }

    // Find the connection to get userId by scanning for connectionId
    const scanResult = await docClient.send(new ScanCommand({
      TableName: process.env.CONNECTIONS_TABLE_NAME!,
      FilterExpression: 'connectionId = :connectionId',
      ExpressionAttributeValues: {
        ':connectionId': connectionId,
      },
    }));

    if (!scanResult.Items || scanResult.Items.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Connection not found' }),
      };
    }

    const connection = scanResult.Items[0] as Connection;

    // Create the message
    const messageId = uuidv4();
    const timestamp = Date.now();
    const retentionDays = parseInt(process.env.MESSAGE_RETENTION_DAYS || '90');
    const expiresAt = dayjs().add(retentionDays, 'day').unix();

    const message: ChatMessage = {
      messageId,
      threadId: payload.threadId,
      messageType: 'user',
      text: payload.text,
      sender: payload.sender,
      timestamp,
      status: 'sent',
      metadata: payload.metadata || {},
      expiresAt,
    };

    // Store the message in DynamoDB
    await docClient.send(new PutCommand({
      TableName: process.env.MESSAGES_TABLE_NAME!,
      Item: message,
    }));

    // Update connection lastSeen
    await docClient.send(new PutCommand({
      TableName: process.env.CONNECTIONS_TABLE_NAME!,
      Item: {
        ...connection,
        lastSeen: timestamp,
      },
    }));

    // Check if human override is active
    if (!connection.isHumanOverride) {
      // Publish to SNS for bot responders
      const snsPayload: SNSMessagePayload = {
        message,
        connection,
        requestMetadata: {
          connectionId: connectionId!,
          userId: connection.userId,
          timestamp,
        },
      };

      await snsClient.send(new PublishCommand({
        TopicArn: process.env.SNS_TOPIC_ARN!,
        Message: JSON.stringify(snsPayload),
        Subject: `New message in thread ${payload.threadId}`,
        MessageAttributes: {
          threadId: {
            DataType: 'String',
            StringValue: payload.threadId,
          },
          userId: {
            DataType: 'String',
            StringValue: connection.userId,
          },
          messageType: {
            DataType: 'String',
            StringValue: 'user',
          },
        },
      }));

      console.log(`Message published to SNS for thread ${payload.threadId}`);
    } else {
      console.log(`Human override active for thread ${payload.threadId}, message not sent to bot`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Message sent successfully',
        messageId,
        timestamp,
      }),
    };
  } catch (error) {
    console.error('Error processing message:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process message' }),
    };
  }
};