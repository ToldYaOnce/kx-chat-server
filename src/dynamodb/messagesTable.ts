import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export function createMessagesTable(scope: Construct, retentionDays: number = 90): Table {
  return new Table(scope, 'MessagesTable', {
    tableName: 'kxgen-chat-messages',
    partitionKey: {
      name: 'threadId',
      type: AttributeType.STRING,
    },
    sortKey: {
      name: 'timestamp',
      type: AttributeType.NUMBER,
    },
    billingMode: BillingMode.PAY_PER_REQUEST,
    timeToLiveAttribute: 'expiresAt',
    removalPolicy: RemovalPolicy.RETAIN,
    pointInTimeRecovery: true,
  });
}