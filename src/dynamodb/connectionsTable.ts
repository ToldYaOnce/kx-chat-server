import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export function createConnectionsTable(scope: Construct): Table {
  return new Table(scope, 'ConnectionsTable', {
    tableName: 'kxgen-chat-connections',
    partitionKey: {
      name: 'userId',
      type: AttributeType.STRING,
    },
    billingMode: BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN,
    pointInTimeRecovery: true,
  });
}