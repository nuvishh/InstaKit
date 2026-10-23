# 📸 InstaKit — Who doesn't follow you back?

**Live →** https://nuvishh.github.io/InstaKit/

An Instagram follow analyser that runs **100% in your browser**. Drop your official Instagram data download and instantly see who doesn't follow you back — no login, no uploads, no tracking.

![InstaKit](instakit-browser-mockup.png)

## Features

- 🚫 **Not following you back** — people you follow who don't follow you
- 💛 **You don't follow back** + 🤝 **Mutuals**, with counts and username search
- ⏳ **Pending requests** — follow requests you sent that were never accepted, with how long they've been waiting
- 🆕 **Followers timeline** — followers newest → oldest, with the date each followed you
- 🕵️ **Unfollow tracker** — saves a private baseline on your device; load a fresh export later and see who unfollowed you and who's new
- 📊 **Insights** — follow-back rate, you-follow-back rate, audience ratio
- 📋 Copy any list, or download as **.txt / .csv**; every row links to the profile
- 📥 Accepts the **full download ZIP** directly, the individual JSON files, or pasted username lists

## How to use

1. Instagram → **Settings → Accounts Centre → Your information and permissions → Download your information**
2. Choose **Some of your information → Followers and following**, format **JSON**, date range **All time**
3. Download the ZIP when it's ready, drop it into InstaKit — done.

## Privacy

Everything is computed locally with vanilla JavaScript. Your export never leaves your device; the unfollow-tracker baseline lives only in your browser's local storage.

## Tech

Single static page — HTML, CSS, vanilla JS (including a tiny built-in ZIP reader). No dependencies, works offline after first load.

## More free tools by nuvish

- [EverQR](https://nuvishh.github.io/EverQR/) — QR code generator, no expiry
- [PixLite](https://nuvishh.github.io/PixLite/) — client-side image compressor
- [Beamo Web](https://nuvishh.github.io/Beamo-Web/) — browser-to-browser file sharing

## License

MIT — see [LICENSE](LICENSE).

Made with ♥ by [nuvish](https://nuvishh.github.io/)
