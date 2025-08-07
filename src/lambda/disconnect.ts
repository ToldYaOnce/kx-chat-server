import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('Disconnect event:', JSON.stringify(event, null, 2));

  const { connectionId } = event.requestContext;

  try {
    // Find the connection record by connectionId
    const scanResult = await docClient.send(new ScanCommand({
      TableName: process.env.CONNECTIONS_TABLE_NAME!,
      FilterExpression: 'connectionId = :connectionId',
      ExpressionAttributeValues: {
        ':connectionId': connectionId,
      },
    }));

    if (scanResult.Items && scanResult.Items.length > 0) {
      const connection = scanResult.Items[0];
      
      // Delete the connection record
      await docClient.send(new DeleteCommand({
        TableName: process.env.CONNECTIONS_TABLE_NAME!,
        Key: {
          userId: connection.userId,
        },
      }));

      console.log(`Connection removed for user ${connection.userId}`);
    } else {
      console.log(`No connection found for connectionId: ${connectionId}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disconnected successfully' }),
    };
  } catch (error) {
    console.error('Error removing connection:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to disconnect' }),
    };
  }
};