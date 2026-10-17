# Huddle voice

Invite gorkie to a Slack huddle and talk to it. It listens, answers out loud,
and hands real work to the `research` and `explore` subagents without going
quiet while they run.

## How it works

Slack gives apps no way into a huddle, so gorkie joins as a second, dedicated
Slack **user**, the same approach as [HuddleFM](https://github.com/ingoau/huddlefm).
That user's browser session listens for huddle invites. Slack hands back
Amazon Chime meeting credentials, and gorkie joins the Chime meeting directly
over WebRTC (`node-datachannel`), sending and receiving Opus audio.

Once in the call:

1. **Listening.** Chime sends one mix of everyone else's audio, which is decoded
   to 16 kHz and streamed to Deepgram Flux. Flux decides when a turn ends.
2. **Who spoke.** Chime's per-attendee volume levels give a best guess at the
   speaker, and their Slack name goes on the message.
3. **Talking.** Each huddle is a Mastra memory thread on the `voice` agent. An
   utterance goes in with `sendMessage`. The agent's reply streams back on a
   thread subscription, and each text delta goes straight into a warm Deepgram
   Flux TTS socket, which picks its own sentence boundaries.
4. **Answering only when addressed.** gorkie replies when someone says its
   name, or when only one person is in the call. In the 20 s after it last
   spoke, with others around, a fast model reads the last few lines and
   decides whether an unnamed line is a follow-up or side chatter. Everything
   else is kept as context without a reply. While gorkie works on a reply, a
   soft looping "thinking" sound plays until its first word, and stops the
   moment someone starts talking.
5. **Barge-in.** Talking over gorkie stops its audio and aborts the reply.
   gorkie tells Flux TTS how much audio actually played, and Flux answers with
   the exact text the room heard, which goes into the thread as a note.
6. **Delegating.** The `voice` agent's only abilities are talking and handing
   work to `research` or `explore`, which run as Mastra background tasks. It
   says a short ack and keeps the conversation going. When a task finishes,
   gorkie says the result once the room is quiet, and posts the full text to
   the huddle thread. Talking over gorkie never cancels a running task.
7. **Leaving.** gorkie leaves when the huddle ends, when it is removed, when it
   has been alone for a minute, or after 15 minutes without anyone speaking.

The voice agent runs on gorkie's normal model ladder with reasoning off, a
1024 token output cap, and a short prompt, which keeps each turn to one fast
model call.

## Setup

1. **Create a Slack user for gorkie's huddle presence**, for example
   `gorkie-voice`, and add it to the channels where you want it in huddles.
2. **Get its session credentials.** Sign in to Slack in a browser as that user,
   then open the browser's developer tools on the Slack tab:
   - **Token:** run
     `Object.values(JSON.parse(localStorage.localConfig_v2).teams)[0].token`
     in the console. It starts with `xoxc-`.
   - **Cookie:** under Application (Chrome) or Storage (Firefox), copy the
     value of the `d` cookie for `slack.com`. It starts with `xoxd-`.

   Signing that browser session out invalidates both, so use a browser profile
   you leave signed in.
3. **Get a Deepgram API key** at <https://console.deepgram.com>.
4. **Fill in `.env`:**

   ```sh
   DEEPGRAM_API_KEY="..."
   HUDDLE_WORKSPACE_URL="https://your-workspace.slack.com"
   HUDDLE_XOXC="xoxc-..."
   HUDDLE_XOXD="xoxd-..."
   HUDDLE_MEDIA_REGION="us-east-1"   # optional
   ```

   Huddles stay off unless the first four are all set.
5. **Restart the bot.** The log shows `[huddle] listening for huddle invites`.
6. **Start a huddle and invite the huddle user.** If `OPT_IN_CHANNEL` is set,
   gorkie ignores invites from people outside that allowlist. Inviting
   gorkie is consent for the whole huddle: anyone in it can talk to gorkie
   without being opted in themselves, and every request runs as the inviter
   (their tool access, their GitHub link). Nobody else gets added to the
   allowlist.

## Limits

- Speaker names are a guess from volume levels, because Chime mixes the room
  into one stream. Two people talking at once get attributed to whoever was
  louder last.
- Speech recognition and the voice are English only (`flux-general-en`,
  `flux-haley-en`). Deepgram also has `flux-general-multi` for multilingual
  speech; switching is one line in `src/mastra/config.ts`.
- There is no voice command to cancel a running delegation yet.
- Untested against a live huddle at the time of writing. See the huddle item
  in `TODO.md`.
