import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export function createResponderTopic(scope: Construct, topicName: string = 'kxgen-chat-responder'): Topic {
  return new Topic(scope, 'ResponderTopic', {
    topicName,
    displayName: 'KXGen Chat Bot Responder Topic',
  });
}