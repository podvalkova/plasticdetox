# Buffer scheduler

Preschedules social posts (Pinterest, Instagram, and anything else connected to
Buffer) from a JSON queue file, using Buffer's GraphQL API.

## One time setup

1. In Buffer, go to **Settings → API** and create a **personal API key**.
   Works on every Buffer plan, including Free.

2. Save it outside the repo (this repo is public via GitHub Pages, so the key
   must never live inside it):

   ```bash
   mkdir -p ~/.config/plasticdetox
   printf '{"apiKey":"YOUR_KEY"}' > ~/.config/plasticdetox/buffer.json
   chmod 600 ~/.config/plasticdetox/buffer.json
   ```

3. Cache your channels and Pinterest boards:

   ```bash
   node tools/social/buffer.mjs setup
   ```

   This writes `tools/social/channels.json` (gitignored) with the channel ids
   and board ids the queue file refers to by name.

## Scheduling posts

Copy `queue.example.json` to something like `queue-september.json`, edit it,
then:

```bash
node tools/social/buffer.mjs check queue-september.json   # validate, sends nothing
node tools/social/buffer.mjs push  queue-september.json   # dry run
node tools/social/buffer.mjs push  queue-september.json --send   # actually schedule
```

`check` and the dry run verify every image is publicly reachable, every board
name exists, every required Pinterest field is present, and no time is in the
past. Nothing reaches Buffer until you pass `--send`.

To see what is already scheduled:

```bash
node tools/social/buffer.mjs list          # upcoming only
node tools/social/buffer.mjs list --all    # includes already sent
```

To stage posts in Buffer without scheduling them, add `--draft`. They land in
Buffer as drafts you can review and publish by hand:

```bash
node tools/social/buffer.mjs push queue-september.json --send --draft
```

## Queue format

```json
{
  "defaults": { "timezone": "America/Los_Angeles" },
  "posts": [
    {
      "id": "water-filters-2026-08-25",
      "channel": "pinterest",
      "when": "2026-08-25 09:00",
      "text": "Post caption.",
      "image": "Pinterest/pin-water1.png",
      "pinterest": {
        "board": "Water Filters",
        "title": "Best Water Filters for Home (2026)",
        "url": "https://plasticdetox.org/articles/best-water-filters.html"
      }
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `id` | Required. Used to avoid double posting. Must be unique across all queues. |
| `channel` | A service name (`pinterest`, `instagram`) or a channel name from `setup`. |
| `when` | Local time, `YYYY-MM-DD HH:MM`. Omit it to drop the post into Buffer's next open queue slot. |
| `timezone` | Per post override of `defaults.timezone`. |
| `text` | Required. The caption. |
| `image` | A repo path (`Pinterest/pin-water1.png`) or a full URL. Required for Pinterest and Instagram. |
| `pinterest.board` | Required for Pinterest. Board name as shown by `setup`. |
| `pinterest.title` | Required for Pinterest. The pin title, 100 characters max. |
| `pinterest.url` | Required for Pinterest. The destination link. |
| `instagram.type` | `post` (default), `reel`, `story`, or `carousel`. |
| `instagram.firstComment` | Optional. **Paid plans only**, Buffer rejects the post on Free. |
| `instagram.shouldShareToFeed` | Defaults to true, except for stories. |
| `twitter.thread` | Optional array of `{ text, image }`. Root post first. |

`image` accepts a single path or an array. Caption length and image count are
checked per network before anything is sent (X 280 with links counted as 23,
Instagram 2,200 and up to 10 images, Pinterest 1 image, X up to 4).

## Per network notes

**Pinterest** publishes automatically. Nothing extra needed.

**X** publishes automatically, including threads, up to 4 images, and quotes.
Buffer absorbs X's API cost, so no X developer account is needed on your side.
Polls and delegate accounts are not supported through Buffer.

**Instagram** only auto publishes to a **Business or Creator** account linked to
a Facebook Page. A Personal account falls back to Buffer's reminder publishing:
Buffer schedules the post and pings your phone at the right time, but you tap to
publish it yourself. The scheduling side of this tool works either way, the
difference is whether the post goes out without you. Stories with music,
stickers, or product tags always fall back to reminders.

## Plan limits

The **Free plan caps you at 3 channels and 10 scheduled posts per channel**, so a
month of prescheduled content will not fit. Essentials at $5 per channel per
month lifts it to unlimited. API rate limits are generous either way (250 calls
per 24 hours on Free), so the post cap is the real ceiling, not the API.

Instagram first comments are also a paid feature. On Free, Buffer rejects the
whole post rather than dropping just the comment, and `push` reports it.

## Images must be public

Buffer does not accept file uploads. It fetches the image URL **at publish
time**, so the image has to be live and permanent. Repo paths are resolved to
`https://plasticdetox.org/<path>`, which means **a pin has to be committed and
pushed before it can be scheduled**. `check` will tell you if one is not live
yet. Avoid signed or expiring URLs; they pass validation and then fail silently
when the post publishes.

## Double posting

Every successful schedule is recorded in `tools/social/sent.json` keyed by post
`id`. Rerunning the same queue skips anything already sent, so `push --send` is
safe to repeat. Delete an entry from `sent.json` if you genuinely want to
reschedule that post.

## Debugging

If Buffer changes a field name, `introspect` dumps a type's fields:

```bash
node tools/social/buffer.mjs introspect PinterestPostMetadataInput
node tools/social/buffer.mjs introspect PostsFiltersInput
```

## Finding X posts to reply to

`x-find.mjs` searches X for conversations worth joining and writes candidates to
`x-candidates.json` (gitignored, since it holds other people's posts).

```bash
node tools/social/x-find.mjs             # default engagement floor of 25
node tools/social/x-find.mjs --min 100   # only bigger conversations
node tools/social/x-find.mjs --fresh     # ignore the seen ledger
```

It reuses the X session already in Chrome by decrypting **only** x.com cookies.
No other site's cookies are read and nothing is written to disk. Chrome can stay
open; the cookie store is snapshotted rather than locked.

**First run needs one approval.** macOS will show a dialog saying something wants
to use confidential information stored in "Chrome Safe Storage". Click **Always
Allow** and it will never ask again. Without it the script exits with
instructions rather than hanging.

Queries live in `x-queries.json`, each mapped to the article the reply should
point at. Edit that file to change what gets surfaced. X's own search operators
do the first pass (`min_faves:`, `-filter:replies`, `-filter:retweets`), then
`--min` filters again on likes + reposts*2 + replies.

Replies are drafted separately, from the candidates file. Buffer cannot help
here: its API posts to your own channels and cannot reply to someone else's
post, so sending happens on X.
