# @toldyaonce/kxgen-chat-server

A reusable AWS CDK construct for deploying real-time chat server infrastructure with WebSocket API, Lambda functions, DynamoDB tables, and SNS integration for bot responders.

## Features

- **WebSocket API** with API Gateway for real-time communication
- **Lambda Functions** for connect/disconnect/message handling
- **DynamoDB Tables** for message persistence and connection tracking
- **SNS Topic** for bot responder integration
- **Message TTL** for automatic cleanup (configurable, default: 90 days)
- **Human Takeover** support via connection flags
- **Utility Functions** for sending responses via WebSocket

## Installation

```bash
npm install @toldyaonce/kxgen-chat-server
```

## Quick Start

```typescript
import { App } from 'aws-cdk-lib';
import { createChatInfraStack } from '@toldyaonce/kxgen-chat-server';

const app = new App();

const chatStack = createChatInfraStack(app, 'MyKXGenChatStack', {
  domain: 'chat.example.com',
  snsTopicName: 'my-chat-responder',
  messageRetentionDays: 90, // Optional, defaults to 90
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
```

## Architecture

### High-Level Architecture

```mermaid
graph TB
    Client[Client WebSocket Connection] --> WSAPI[WebSocket API Gateway]
    
    WSAPI --> ConnectLambda[Connect Lambda]
    WSAPI --> DisconnectLambda[Disconnect Lambda]
    WSAPI --> MessageSendLambda[MessageSend Lambda]
    
    ConnectLambda --> ConnectionsTable[Connections Table<br/>DynamoDB]
    DisconnectLambda --> ConnectionsTable
    MessageSendLambda --> ConnectionsTable
    MessageSendLambda --> MessagesTable[Messages Table<br/>DynamoDB]
    MessageSendLambda --> SNSTopic[SNS Topic<br/>Bot Responder]
    
    SNSTopic --> BotLambda[Bot Responder Lambda<br/>External]
    BotLambda --> PostToConnectionLambda[PostToConnection Lambda]
    PostToConnectionLambda --> ConnectionsTable
    PostToConnectionLambda --> MessagesTable
    PostToConnectionLambda --> WSAPI
    
    WSAPI --> Client
    
    style Client fill:#e1f5fe
    style WSAPI fill:#f3e5f5
    style ConnectLambda fill:#fff3e0
    style DisconnectLambda fill:#fff3e0
    style MessageSendLambda fill:#fff3e0
    style PostToConnectionLambda fill:#fff3e0
    style ConnectionsTable fill:#e8f5e8
    style MessagesTable fill:#e8f5e8
    style SNSTopic fill:#fce4ec
    style BotLambda fill:#f1f8e9
```

### Data Flow Diagram

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket API
    participant CL as Connect Lambda
    participant ML as MessageSend Lambda
    participant CT as Connections Table
    participant MT as Messages Table
    participant SNS as SNS Topic
    participant BL as Bot Lambda
    participant PL as PostToConnection Lambda

    Note over C,PL: Connection Flow
    C->>WS: Connect with userId & threadId
    WS->>CL: $connect route
    CL->>CT: Store connection info
    CL-->>C: Connection established

    Note over C,PL: Message Send Flow
    C->>WS: Send message
    WS->>ML: message.send route
    ML->>CT: Get connection info
    ML->>MT: Store message with TTL
    ML->>SNS: Publish message for bots
    ML-->>C: Message sent confirmation

    Note over C,PL: Bot Response Flow
    SNS->>BL: Notify bot responder
    BL->>BL: Process message with AI
    BL->>PL: Send response via API
    PL->>CT: Lookup connectionId
    PL->>MT: Store bot message
    PL->>WS: Post to connection
    WS-->>C: Receive bot response

    Note over C,PL: Disconnect Flow
    C->>WS: Disconnect
    WS->>DisconnectLambda: $disconnect route
    DisconnectLambda->>CT: Remove connection
```

### Database Schema

```mermaid
erDiagram
    MESSAGES {
        string threadId PK
        number timestamp SK
        string messageId
        string messageType
        string text
        string sender
        string status
        object metadata
        number expiresAt
    }
    
    CONNECTIONS {
        string userId PK
        string connectionId
        string threadId
        number lastSeen
        boolean isHumanOverride
    }
    
    MESSAGES ||--o{ CONNECTIONS : "threadId"
```

### AWS Infrastructure Components

```mermaid
graph LR
    subgraph "API Gateway"
        WSAPI[WebSocket API<br/>wss://api-id.execute-api.region.amazonaws.com]
        Stage[Stage: prod<br/>Auto Deploy]
    end
    
    subgraph "Lambda Functions"
        ConnectFn[Connect Function<br/>Node.js 18.x]
        DisconnectFn[Disconnect Function<br/>Node.js 18.x]
        MessageSendFn[MessageSend Function<br/>Node.js 18.x]
        PostToConnFn[PostToConnection Function<br/>Node.js 18.x]
    end
    
    subgraph "DynamoDB"
        MessagesDB[Messages Table<br/>Partition: threadId<br/>Sort: timestamp<br/>TTL: expiresAt]
        ConnectionsDB[Connections Table<br/>Partition: userId<br/>Point-in-time Recovery]
    end
    
    subgraph "SNS"
        Topic[Responder Topic<br/>Fan-out to subscribers]
    end
    
    subgraph "IAM Permissions"
        LambdaRole[Lambda Execution Roles<br/>DynamoDB Read/Write<br/>SNS Publish<br/>API Gateway PostToConnection]
    end
    
    WSAPI --> Stage
    Stage --> ConnectFn
    Stage --> DisconnectFn  
    Stage --> MessageSendFn
    
    ConnectFn --> ConnectionsDB
    DisconnectFn --> ConnectionsDB
    MessageSendFn --> ConnectionsDB
    MessageSendFn --> MessagesDB
    MessageSendFn --> Topic
    PostToConnFn --> ConnectionsDB
    PostToConnFn --> MessagesDB
    PostToConnFn --> Stage
    
    LambdaRole --> ConnectFn
    LambdaRole --> DisconnectFn
    LambdaRole --> MessageSendFn
    LambdaRole --> PostToConnFn
    
    style WSAPI fill:#ff9800
    style ConnectFn fill:#4caf50
    style DisconnectFn fill:#4caf50
    style MessageSendFn fill:#4caf50
    style PostToConnFn fill:#4caf50
    style MessagesDB fill:#2196f3
    style ConnectionsDB fill:#2196f3
    style Topic fill:#e91e63
    style LambdaRole fill:#9c27b0
```

### WebSocket API Routes

- **$connect** - Establishes connection, requires `userId` and `threadId` query parameters
- **$disconnect** - Cleans up connection records
- **message.send** - Handles user messages, stores them, and publishes to SNS

### DynamoDB Tables

#### Messages Table
- **Partition Key**: `threadId`
- **Sort Key**: `timestamp`
- **TTL**: `expiresAt` (configurable retention period)
- **Attributes**: `messageType`, `text`, `sender`, `status`, `metadata`

#### Connections Table
- **Partition Key**: `userId`
- **Attributes**: `connectionId`, `threadId`, `lastSeen`, `isHumanOverride`

### SNS Integration

The stack publishes messages to an SNS topic that bot responders can subscribe to:

```json
{
  "message": {
    "messageId": "uuid",
    "threadId": "thread-123",
    "messageType": "user",
    "text": "Hello!",
    "sender": "user@example.com",
    "timestamp": 1234567890,
    "status": "sent",
    "metadata": {}
  },
  "connection": {
    "userId": "user-123",
    "connectionId": "abc123",
    "threadId": "thread-123",
    "lastSeen": 1234567890,
    "isHumanOverride": false
  },
  "requestMetadata": {
    "connectionId": "abc123",
    "userId": "user-123",
    "timestamp": 1234567890
  }
}
```

## Usage Examples

### Connecting to WebSocket

```javascript
const ws = new WebSocket('wss://your-api-id.execute-api.region.amazonaws.com/prod?userId=user123&threadId=thread456');

ws.onopen = () => {
  console.log('Connected to chat server');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

### Sending Messages

```javascript
ws.send(JSON.stringify({
  action: 'message.send',
  threadId: 'thread-456',
  text: 'Hello, world!',
  sender: 'user@example.com',
  metadata: {
    userAgent: navigator.userAgent
  }
}));
```

### Bot Responder Lambda

```typescript
import { SNSHandler } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

export const handler: SNSHandler = async (event) => {
  for (const record of event.Records) {
    const payload = JSON.parse(record.Sns.Message);
    
    // Process the message with your bot logic
    const response = await processWithBot(payload.message.text);
    
    // Send response back via the postToConnection function
    const postResponse = await fetch('https://your-post-to-connection-api/invoke', {
      method: 'POST',
      body: JSON.stringify({
        userId: payload.connection.userId,
        threadId: payload.message.threadId,
        message: {
          messageId: generateId(),
          threadId: payload.message.threadId,
          messageType: 'bot',
          text: response,
          sender: 'bot',
          timestamp: Date.now(),
          status: 'sent'
        }
      })
    });
  }
};
```

### Human Takeover

To enable human takeover for a specific user:

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Enable human override
await docClient.send(new UpdateCommand({
  TableName: 'kxgen-chat-connections',
  Key: { userId: 'user-123' },
  UpdateExpression: 'SET isHumanOverride = :override',
  ExpressionAttributeValues: {
    ':override': true
  }
}));
```

## Configuration Options

```typescript
interface ChatStackProps extends StackProps {
  domain: string;                    // Required: Domain for the WebSocket API
  snsTopicName?: string;            // Optional: SNS topic name (default: 'kxgen-chat-responder')
  messageRetentionDays?: number;    // Optional: Message TTL in days (default: 90)
}
```

## Advanced Usage

### Accessing Individual Resources

```typescript
import { ChatInfraStack } from '@toldyaonce/kxgen-chat-server';

const stack = new ChatInfraStack(app, 'ChatStack', props);

// Access individual resources
const webSocketUrl = stack.webSocketApi.apiEndpoint;
const topicArn = stack.responderTopic.topicArn;
const messagesTableName = stack.messagesTable.tableName;
```

### Custom Lambda Integration

```typescript
import { createResponderTopic, createMessagesTable } from '@toldyaonce/kxgen-chat-server';

// Use individual components
const topic = createResponderTopic(this, 'MyTopic');
const table = createMessagesTable(this, 30); // 30 days retention
```

## Security

- All Lambda functions use least-privilege IAM roles
- DynamoDB tables have point-in-time recovery enabled
- WebSocket connections require userId and threadId parameters
- Stale connections are automatically cleaned up

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT