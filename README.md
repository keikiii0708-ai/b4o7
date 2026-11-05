# B4O7

A week is like a 7-game series. All you gotta do is win 4 days.

B4O7 is a private habit tracker that stays on your phone. There is no account, no server, and no analytics. Goals, sleep, notes, and reward photos are stored in this browser only. The app works offline after it has loaded once.

Each goal has its own series. Nothing is combined into one score.

The icon is a ring of seven arcs — four muted green, three graphite — with a B4 monogram. That ring is the header mark. Each goal draws its week the same way: green is a win, red is a loss, grey is still open, and a dimmer stroke is a rest day.

## Put it on GitHub Pages

You can do this from the GitHub website. You do not need Git, a terminal, or a build step.

1. Unzip `b4o7-site.zip`. You should see `index.html`, plus folders named `css`, `js`, and `icons`, and this README.
2. On [github.com](https://github.com), click the **+** menu, then **New repository**.
3. Name the repository `b4o7`. Choose **Public** (free GitHub Pages needs a public repository). Do not add a README, a license, or a .gitignore. Those would mix with the files you are about to upload.
4. Create the repository. On the empty page, choose **uploading an existing file**.
5. Drag in the unzipped files and folders. Upload the contents, not the zip file itself.
6. Commit the upload.
7. Open **Settings → Pages**.
8. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
9. Choose branch **main** and folder **/ (root)**. Save.
10. Wait a minute. GitHub shows the site address. It looks like `https://your-name.github.io/b4o7/`.

The address includes the repository name. That is expected. Links inside the app are relative, so it works from that subpath.

Do not upload a backup JSON file to this repository. The site files contain no personal data. Your life stays on the phone.

## Install it on an iPhone

1. Open the GitHub Pages address in **Safari**. Chrome on iPhone cannot add a home-screen app.
2. Tap the **Share** button.
3. Tap **Add to Home Screen**, then **Add**.
4. Open **B4O7** from the home screen. It should fill the screen, with no Safari address bar.

The first open needs a network connection so the phone can save the app. After that it works offline, including on a plane, until you update it.

On a Mac, open the same address in a browser. The layout stays in a centered column.

## How a week is scored

- You choose a target from 1 to 7. The default is 4.
- Today is pending until you win it. A pending day is never shown as a loss.
- A past day with no win counts as a loss, unless it is a rest day or the goal did not exist yet.
- Rest days are neutral. You cannot set so many rest days that the target becomes impossible.
- When your wins reach the target, the series is won. You can keep logging. Extra wins still count.
- The series closes when the target is out of reach, or when the week ends below the target.
- Changing a target later does not rewrite weeks that already happened. The app keeps a snapshot of each week.
- Week starts on Monday or Sunday. Choose once in Settings. Past targets are kept if you switch later.

Sleep is its own screen. A night is tied to the morning you wake up. Bedtime, wake time, and the gap are stored with the time zone. “7h 53m” is the recorded interval, not a medical measurement. A night with no wake time stays incomplete. Correcting a night is marked as corrected.

## Backup and restore

Settings → **Export backup** downloads one JSON file. It includes notes, sleep, and any photos you attached. On iPhone, Safari may put it in Downloads. Move it to the Files app, or somewhere else you trust.

**Export history CSV** is a spreadsheet of the days, without photos.

**Import backup** offers two choices:

- **Merge** adds and updates records. It leaves other records on the phone alone.
- **Replace** deletes what is on this phone first. You must type `REPLACE`.

**Delete all data** asks you to type `DELETE`.

Load demo data, in Settings, adds sample goals so you can look around. It does not delete your own records. Remove demo data is next to it. The sample is never loaded by itself.

Export a backup every couple of weeks. The home screen will remind you, quietly, once you have real data and have not exported for a while.

## iPhone limits

- **Notifications.** There is no server to ping you. iOS does not keep this app awake in the background. A reminder can appear only while B4O7 is open. Allowing notifications is optional, and it still only works in that moment.
- **Storage.** iOS can delete website data if the phone is low on space, or if the app sits unused for a long time. B4O7 asks iOS to keep the data. iOS can still say no. A backup file is the real copy.
- **Offline.** After the first successful load, the app is saved on the phone. Clearing Safari website data, or deleting the home-screen icon and the saved website data, removes the log. Export a backup before you do either.
- **Updates.** The phone keeps the old copy until it can download a new one. See below.

## Update the app

1. Download the new zip and unzip it.
2. On GitHub, open the repository and upload the new files. When a file already exists, GitHub asks you to replace it. Replace them.
3. Wait until Pages finishes.
4. On the iPhone, open B4O7 while you are online. If a bar says a new version is ready, tap **Reload**.
5. If the old version sticks, open the site once in Safari, then open the home-screen icon again. Removing the icon does not delete your log by itself, but export a backup first anyway.

## Look at it on a computer, without GitHub

From the folder that contains `index.html`:

```bash
python3 -m http.server 8741
```

Open `http://127.0.0.1:8741`. Do not open `index.html` as a file. The app needs a web address so it can save data.

The scoring rules have tests. They are optional:

```bash
node --test tests/*.test.js
```
