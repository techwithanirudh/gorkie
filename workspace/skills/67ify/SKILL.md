---
name: 67ify
description: Turn an image into a 67ify-style animated GIF with the public 67ify API. Use when someone asks to make a 67 or 55 GIF, or to 67ify an image, emoji, avatar, or sticker.
---

# Use 67ify API

## Overview

Use the 67ify REST API to convert an uploaded image into an animated GIF. The
API is unauthenticated and accepts either `mode=67` or `mode=55`.

## Inputs

Require:

- The image. A Slack upload arrives through `get_slack_file`, which saves it under `/home/user/downloads`; a custom emoji through `get_slack_emoji`.

Optional:

- Mode: `67` or `55`. Default to `67` if the user does not specify one.

## Workflow

1. Get the image into the sandbox (see Inputs).
2. Call the API with `curl` (see below), writing the GIF next to the input.
3. Confirm the output file exists and is non-empty.
4. Send the GIF with `upload_file`.
5. Mention that the image was sent to 67ify, a public third-party service, because it leaves the sandbox. Ask before sending an image that looks private or sensitive.

## Call the API

```bash
curl --silent --show-error --fail \
  --request POST 'https://67ify.vercel.app/api/convert' \
  --form 'image=@/home/user/downloads/input.png' \
  --form 'mode=67' \
  --output /home/user/downloads/output.gif
```

## API Contract

Multipart fields:

- `image`: uploaded image file.
- `mode`: `67` or `55`.

Successful response:

- Status: `200`
- Content-Type: `image/gif`
- Body: generated GIF bytes

Common errors:

- `400`: missing image field.
- `413`: upload body exceeds 8 MB.
- `415`: unsupported body type.
- `500`: conversion failed.
