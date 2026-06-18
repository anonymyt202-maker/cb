You are a senior full-stack engineer.

Analyze my entire project and FIX all bugs. Do not explain only. Actually modify the code architecture and provide the corrected files.

MAIN BUG:

Currently when I add a Telegram channel image URL or Telegram post image URL as a Gift/NFT image, the frontend displays the URL text (t.me/...) instead of an actual image.

REQUIRED FIX:

1. When admin adds a Gift or NFT:
   
   - Admin can upload an image file directly.
   - Admin can also provide an image URL.

2. If URL is provided:
   
   - Backend downloads the image automatically.
   - Save image inside:

uploads/gifts/
uploads/nfts/
uploads/cases/

3. Database must NEVER store Telegram links as image values.

Instead store:

/uploads/gifts/file.png

or

/uploads/nfts/file.png

4. Case opening animation must use local uploaded images.

5. Inventory must use local uploaded images.

6. Won rewards popup must use local uploaded images.

7. Reward cards must use local uploaded images.

8. Remove every possibility where URL text can appear on screen.

=================================

MANDATORY CHANNEL JOIN SYSTEM

Implement anti-fake-referral protection.

Flow:

User presses /start

Bot checks channel membership.

If not subscribed:

Show join channel message.

Buttons:

Join Channel
Check Subscription

User cannot access WebApp until subscribed.

Only after successful subscription:

Show welcome message.

Show Open App button.

=================================

START MESSAGE EDITOR

Admin panel must allow editing:

- Welcome text
- Button text
- Button URLs
- Additional buttons
- Join channel text
- Subscription success text

Store all texts in database.

No hardcoded text.

=================================

REFERRAL PROTECTION

Referral counted ONLY IF:

1. User joined required channel.
2. User opened WebApp after joining.
3. User is a new user.

Prevent fake referrals.

=================================

ADMIN PANEL MOBILE FIX

Current admin panel is desktop oriented.

Make fully mobile responsive.

Requirements:

- Works inside Telegram WebView.
- No horizontal scrolling.
- Cards stack vertically.
- Mobile sidebar drawer.
- Touch-friendly buttons.
- Responsive tables.

=================================

BROADCAST FIX

Current broadcast system is broken.

Fix:

- Send to all users.
- Send text.
- Send image.
- Send buttons.
- Retry failed users.
- Show progress.
- Save broadcast logs.

=================================

UI IMPROVEMENTS

Replace emoji-only menu icons with professional PNG icons.

Create icon assets for:

cases.png
games.png
inventory.png
referrals.png
deposit.png
withdraw.png
upgrade.png
settings.png
broadcast.png
users.png

Store:

public/icons/

Update frontend to use these images.

=================================

OUTPUT FORMAT

1. List every bug found.
2. Explain root cause.
3. Show all modified files.
4. Show exact code changes.
5. Show database migrations.
6. Show folder structure changes.
7. Show deployment steps.
8. Ensure project is production ready.

Do not give suggestions only.

Actually rewrite the affected code and files.