import { App, Construct } from 'constructs';
import { ChatInfraStack } from './stack';
import { ChatStackProps } from './types';

export { ChatInfraStack, ChatStackProps };
export * from './types';

/**
 * Creates a complete chat infrastructure stack with WebSocket API, Lambda functions,
 * DynamoDB tables, and SNS topic for bot responders.
 * 
 * @param scope The CDK App or parent construct
 * @param id The unique identifier for this stack
 * @param props Configuration properties for the chat stack
 * @returns The created ChatInfraStack instance
 */
export function createChatInfraStack(scope: Construct, id: string, props: ChatStackProps): ChatInfraStack {
  return new ChatInfraStack(scope, id, props);
}

// Export individual components for advanced use cases
export { createMessagesTable } from './dynamodb/messagesTable';
export { createConnectionsTable } from './dynamodb/connectionsTable';
export { createResponderTopic } from './sns/responderTopic';