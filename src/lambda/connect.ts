import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Connection, WebSocketEvent } from '../types';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('Connect event:', JSON.stringify(event, null, 2));

  const { connectionId } = event.requestContext;
  const { userId, threadId } = event.queryStringParameters || {};

  if (!userId || !threadId) {
    console.error('Missing required parameters: userId or threadId');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required parameters: userId and threadId' }),
    };
  }

  try {
    const connection: Connection = {
      userId,
      connectionId,
      threadId,
      lastSeen: Date.now(),
      isHumanOverride: false,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.CONNECTIONS_TABLE_NAME!,
      Item: connection,
    }));

    console.log(`Connection stored for user ${userId} in thread ${threadId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Connected successfully' }),
    };
  } catch (error) {
    console.error('Error storing connection:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to connect' }),
    };
  }
};