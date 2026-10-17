# Huddle voice

Invite gorkie to a Slack huddle and talk to it. It answers out loud and hands
real work to the `research` and `explore` subagents, and you can keep talking
to it while they run.

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
   name, during a back and forth (20 s after it last spoke), or when only one
   person is in the call. Everything else is kept as context without a reply.
5. **Barge-in.** Talking over gorkie stops its audio and aborts the reply.
   gorkie tells Flux TTS how much audio actually played, and Flux answers with
   the exact text the room heard, which goes into the thread as a note.
6. **Delegating.** The `voice` agent hands real work to `research` or
   `explore`, which run as Mastra background tasks as the person who invited
   gorkie. It says a short ack and keeps the conversation going. When a task
   finishes, Mastra continues the talker with the result and it says the
   answer. Asked how it is going, gorkie calls `task_status`, which lists each
   running task with how long it has run, the tool it is on, and its latest
   partial text. Talking over gorkie never cancels a running task.
7. **Posting.** Asked to "drop that in the thread", gorkie posts with
   `post_message`, to the huddle thread by default and using a subagent's
   full text so links survive. Anywhere else, it says what and where first and
   waits for a yes.
8. **Leaving.** gorkie leaves when asked out loud (it says goodbye and hangs
   up), when text gorkie is asked to (`leave_huddle`), when the huddle ends,
   when it is removed, when it has been alone for a minute, or after 15
   minutes without anyone speaking.

The voice agent leads with `minimax-m3` (`huddle.model` in
`src/mastra/config.ts`) with thinking off, then falls back to gorkie's normal
model ladder. Replies are capped at 1024 tokens and 4 steps, and the prompt is
short, so the first spoken word is not waiting on a long generation.

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

   Set all of the first four or none of them. With none, huddles are off. A
   partial set fails at startup with a message naming the four.
5. **Restart the bot.** The log shows `[huddle] listening for huddle invites`.
6. **Start a huddle and invite the huddle user.** If `OPT_IN_CHANNEL` is set,
   gorkie ignores invites from people outside that allowlist. Inviting
   gorkie is consent for the whole huddle. Anyone in it can talk to gorkie
   without being opted in themselves, and every request runs as the inviter,
   with their tool access and their GitHub link. Nobody else gets added to the
   allowlist.

## Limits

- Speaker names are a guess from volume levels, because Chime mixes the room
  into one stream. Two people talking at once get attributed to whoever was
  louder last.
- Speech recognition and the voice are English only (`flux-general-en`,
  `flux-alexis-en`). Deepgram also has `flux-general-multi` for multilingual
  speech; switching is one line in `src/mastra/config.ts`.
- There is no voice command to cancel a running delegation yet.
- Untested against a live huddle at the time of writing. See the huddle item
  in `TODO.md`.
