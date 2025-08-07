import { StackProps } from 'aws-cdk-lib';

export interface ChatStackProps extends StackProps {
  domain: string;
  snsTopicName?: string;
  messageRetentionDays?: number;
}

export interface ChatMessage {
  messageId: string;
  threadId: string;
  messageType: 'user' | 'bot' | 'system';
  text: string;
  sender: string;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
  metadata?: Record<string, any>;
  expiresAt: number;
}

export interface Connection {
  userId: string;
  connectionId: string;
  threadId: string;
  lastSeen: number;
  isHumanOverride: boolean;
}

export interface WebSocketEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    apiId: string;
    stage: string;
    domainName?: string;
  };
  body?: string;
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface MessageSendPayload {
  action: 'message.send';
  threadId: string;
  text: string;
  sender: string;
  metadata?: Record<string, any>;
}

export interface PostToConnectionPayload {
  userId: string;
  threadId: string;
  message: Omit<ChatMessage, 'expiresAt'>;
}

export interface SNSMessagePayload {
  message: ChatMessage;
  connection: Connection;
  requestMetadata: {
    connectionId: string;
    userId: string;
    timestamp: number;
  };
}