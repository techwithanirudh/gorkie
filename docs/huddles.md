# Huddle voice

Invite gorkie to a Slack huddle and talk to it. It listens, answers out loud,
and hands real work to gorkie's full text agent, which runs in the background
while the conversation carries on.

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
3. **Talking.** Each huddle is a Mastra memory thread on a thin `voice`
   agent. Lines said in the room collect as a backlog. When one is addressed
   to gorkie, the backlog goes to the talker in one `stream` call, and each
   text delta goes straight into a warm Deepgram Flux TTS socket, which picks
   its own sentence boundaries.
4. **Speaking only when spoken to.** gorkie replies when someone says its
   name. In the 20 s after it last spoke, a fast model reads the last few
   lines and decides whether an unnamed line is a follow-up or side chatter.
   Everything else, even alone with one person, waits in the backlog as
   context without a reply. While gorkie works on a reply, the bot shows its
   "is thinking..." status in the huddle thread, the same indicator as text
   chat.
5. **Barge-in.** Talking over gorkie stops its audio and aborts the reply.
   gorkie tells Flux TTS how much audio actually played, and Flux answers with
   the exact text the room heard, which goes into the next turn as a note. A
   newer addressed line replaces a reply that is still thinking, and the
   aborted reply's lines go back on the backlog.
6. **Delegating.** The talker has one tool, `delegate`. It runs gorkie's full
   text agent in the background as the inviter, anchored on the huddle
   thread, so everything text gorkie can do (Slack search, the web, GitHub,
   code) works from a huddle. Delegating doesn't end the talker's turn: it
   can say one short line, before or after the call. While a task runs,
   each turn gets a note with how long it has been going and the tool it is
   using now, so "how's that going?" gets a real answer. When the task
   finishes, its full answer is posted to the huddle thread, and gorkie says
   the gist once the room is quiet. A task outlives the huddle and still
   posts its answer.
7. **Leaving.** gorkie leaves when the huddle ends, when it is removed, when it
   has been alone for a minute, or after 15 minutes without anyone speaking.

The talker leads with a fast model (`huddle.model` in `src/mastra/config.ts`,
MiniMax M3 on OpenCode Go by default) and falls back to gorkie's normal
ladder, with reasoning off, a 1024 token output cap, a short prompt, no
tools but `delegate`, the last 12 messages verbatim, and thread-scoped
observational memory for older turns. Its observer buffers in the
background, and working memory is off, so a spoken turn is one fast model
call. Each addressed turn logs its stage timings in milliseconds after the
end of speech (`[huddle] turn timing`), and each delegation logs how long it
took.

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
6. **Start a huddle and invite the huddle user,** or @mention gorkie in a
   channel and ask it to huddle: its `join_huddle` tool adds the huddle user
   to the channel (it joins public channels itself, and the bot invites it to
   private ones) and joins the channel's huddle, starting one if none is
   running. The person asking counts as the inviter. If `OPT_IN_CHANNEL` is set,
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
  `flux-sienna-en`). Deepgram also has `flux-general-multi` for multilingual
  speech; switching is one line in `src/mastra/config.ts`.
- There is no voice command to cancel a running delegation yet.
- gorkie has no video tile yet. HuddleFM shows one, so it is possible over
  the same Chime link; see `TODO.md`.
- Untested against a live huddle at the time of writing. See the huddle item
  in `TODO.md`.
