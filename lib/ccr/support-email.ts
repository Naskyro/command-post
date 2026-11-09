/** Open a verified source message in the same company mailbox used for imports. */
export function supportEmailUrl(messageId: string): string | undefined {
  if (!/^[a-f0-9]{8,64}$/i.test(messageId)) return undefined;
  return 'https://mail.google.com/mail/u/?authuser=support%40gtowingtransport.com#all/' + messageId.toLowerCase();
}
