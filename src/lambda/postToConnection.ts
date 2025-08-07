import { APIGatewayProxyHandler } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { PostToConnectionPayload, ChatMessage } from '../types';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('Post to connection event:', JSON.stringify(event, null, 2));

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const payload: PostToConnectionPayload = JSON.parse(event.body);

    if (!payload.userId || !payload.threadId || !payload.message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: userId, threadId, message' }),
      };
    }

    // Look up the connection for the user
    const connectionResult = await docClient.send(new GetCommand({
      TableName: process.env.CONNECTIONS_TABLE_NAME!,
      Key: { userId: payload.userId },
    }));

    if (!connectionResult.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Connection not found for user' }),
      };
    }

    const connection = connectionResult.Item;
    const { connectionId } = connection;

    // Create the API Gateway Management API client
    const apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint: `https://${process.env.WEBSOCKET_API_ID}.execute-api.${process.env.AWS_REGION}.amazonaws.com/${process.env.STAGE}`,
    });

    // Prepare the full message with TTL
    const retentionDays = parseInt(process.env.MESSAGE_RETENTION_DAYS || '90');
    const expiresAt = dayjs().add(retentionDays, 'day').unix();
    
    const fullMessage: ChatMessage = {
      ...payload.message,
      messageId: payload.message.messageId || uuidv4(),
      expiresAt,
    };

    try {
      // Send the message via WebSocket
      await apiGatewayClient.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(fullMessage),
      }));

      // Store the message in DynamoDB
      await docClient.send(new PutCommand({
        TableName: process.env.MESSAGES_TABLE_NAME!,
        Item: fullMessage,
      }));

      console.log(`Message sent to user ${payload.userId} in thread ${payload.threadId}`);

      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Message sent successfully',
          messageId: fullMessage.messageId,
        }),
      };
    } catch (postError: any) {
      // Handle stale connections
      if (postError.statusCode === 410) {
        console.log(`Stale connection detected for user ${payload.userId}, cleaning up`);
        
        // Remove the stale connection
        await docClient.send(new DeleteCommand({
          TableName: process.env.CONNECTIONS_TABLE_NAME!,
          Key: { userId: payload.userId },
        }));

        return {
          statusCode: 410,
          body: JSON.stringify({ error: 'Connection no longer exists' }),
        };
      }
      
      throw postError;
    }
  } catch (error) {
    console.error('Error posting to connection:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send message' }),
    };
  }
};