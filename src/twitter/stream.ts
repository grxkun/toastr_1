import { TwitterApi, ETwitterStreamEvent } from 'twitter-api-v2';
import { handleLaunch } from '../handlers/launch';
import { handleRegister } from '../handlers/register';
import { handleDelegate } from '../handlers/delegate';
import { invalidCommandReply } from '../utils/replies';

// ──────────────────────────────────────────────────────────────
// Twitter client
// ──────────────────────────────────────────────────────────────

function buildTwitterClient(): TwitterApi {
  const appKey = process.env.TWITTER_APP_KEY;
  const appSecret = process.env.TWITTER_APP_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error(
      'Twitter API credentials are missing. Set TWITTER_APP_KEY, ' +
        'TWITTER_APP_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET.',
    );
  }

  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

// ──────────────────────────────────────────────────────────────
// Stream setup helpers
// ──────────────────────────────────────────────────────────────

const TOASTER_HANDLE = process.env.TOASTER_HANDLE ?? 'Toaster';

/** The filtered-stream rule that captures all mentions of @Toaster */
const STREAM_RULE_TAG = 'toaster-mentions';

async function ensureStreamRules(client: TwitterApi): Promise<void> {
  const rwClient = client.readWrite;
  const existingRules = await rwClient.v2.streamRules();

  // Remove stale rules
  if (existingRules.data && existingRules.data.length > 0) {
    const staleIds = existingRules.data
      .filter((r) => r.tag !== STREAM_RULE_TAG)
      .map((r) => r.id);
    if (staleIds.length > 0) {
      await rwClient.v2.updateStreamRules({ delete: { ids: staleIds } });
    }

    // Rule already exists
    if (existingRules.data.some((r) => r.tag === STREAM_RULE_TAG)) return;
  }

  // Add the mention rule
  await rwClient.v2.updateStreamRules({
    add: [
      {
        value: `@${TOASTER_HANDLE} -is:retweet`,
        tag: STREAM_RULE_TAG,
      },
    ],
  });
  console.log(`[Stream] Stream rule set for @${TOASTER_HANDLE}`);
}

// ──────────────────────────────────────────────────────────────
// Tweet reply helper
// ──────────────────────────────────────────────────────────────

async function replyToTweet(
  client: TwitterApi,
  tweetId: string,
  message: string,
): Promise<void> {
  try {
    await client.readWrite.v2.tweet({
      text: message,
      reply: { in_reply_to_tweet_id: tweetId },
    });
  } catch (err) {
    console.error(`[Stream] Failed to reply to tweet ${tweetId}:`, err);
  }
}

// ──────────────────────────────────────────────────────────────
// Tweet dispatcher
// ──────────────────────────────────────────────────────────────

/**
 * Dispatches an incoming tweet to the appropriate handler based on the command.
 */
async function dispatchTweet(
  client: TwitterApi,
  tweetId: string,
  authorHandle: string,
  text: string,
): Promise<void> {
  const normalized = text.toLowerCase();

  let reply: string;

  // Build a replyFn for handlers that may need to send interim messages
  const replyFn = async (msg: string): Promise<void> => {
    await replyToTweet(client, tweetId, msg);
  };

  if (normalized.includes('launch')) {
    reply = await handleLaunch(authorHandle, text, replyFn);
  } else if (normalized.includes('delegate')) {
    reply = await handleDelegate(authorHandle, text);
  } else if (normalized.includes('register')) {
    reply = await handleRegister(authorHandle, text);
  } else {
    reply = invalidCommandReply();
  }

  await replyToTweet(client, tweetId, reply);
}

// ──────────────────────────────────────────────────────────────
// Main stream entry point
// ──────────────────────────────────────────────────────────────

/**
 * Starts the Twitter Filtered Stream and listens for @Toaster mentions.
 */
export async function startStream(): Promise<void> {
  const client = buildTwitterClient();

  await ensureStreamRules(client);

  const stream = await client.v2.searchStream({
    'tweet.fields': ['author_id', 'text', 'entities'],
    'user.fields': ['username'],
    expansions: ['author_id'],
  });

  console.log('[Stream] Listening for @' + TOASTER_HANDLE + ' mentions…');

  stream.on(ETwitterStreamEvent.Data, async (tweet) => {
    try {
      const tweetId = tweet.data.id;
      const tweetText = tweet.data.text;

      // Resolve author handle from expansions
      const authorId = tweet.data.author_id;
      const authorUser = tweet.includes?.users?.find((u) => u.id === authorId);
      const authorHandle = authorUser?.username ?? authorId ?? 'unknown';

      // Ignore if the tweet is from Toaster itself (prevent loops)
      if (authorHandle.toLowerCase() === TOASTER_HANDLE.toLowerCase()) return;

      console.log(`[Stream] @${authorHandle}: ${tweetText}`);

      await dispatchTweet(client, tweetId, authorHandle, tweetText);
    } catch (err) {
      console.error('[Stream] Error handling tweet:', err);
    }
  });

  stream.on(ETwitterStreamEvent.ConnectionError, (err) => {
    console.error('[Stream] Connection error:', err);
  });

  stream.on(ETwitterStreamEvent.ConnectionClosed, () => {
    console.warn('[Stream] Connection closed. Reconnecting in 30s…');
    setTimeout(() => {
      startStream().catch((err) =>
        console.error('[Stream] Reconnect failed:', err),
      );
    }, 30_000);
  });
}
