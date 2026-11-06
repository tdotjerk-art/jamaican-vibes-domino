# Jamaican Vibes Domino V3

Single-player remains local. Online mode is server-authoritative.

Added in V3:
- Home screen
- Online lobby with room code
- Four-player Ready system
- Host controls for Partner/Cut Throat and target 6/10/12
- 90-second reconnect grace period with seat/token recovery
- Game pause while a player reconnects
- Leave Game
- Rematch voting
- Connected/disconnected indicators
- Game sounds + mute setting
- Hand/match history
- Clear live score banner
- Spectator mode with no access to hidden hands
- Rate limiting for excessive socket actions
- Server-only shuffle/deal, move validation, timers, scoring and blocked-game rules
- Private hands are sent only to the owning player until reveal
- Responsive mobile UI

Local run:
1. Install Node.js
2. npm install
3. npm start
4. Open http://localhost:3000

Production deployment:
Use a Node host with persistent WebSocket support. Start command: npm start.

Recommended pre-launch test matrix:
- 4 real phones/computers
- create/join/ready
- Partner and Cut Throat
- timer expiry at 4+, 3 and 2 dominoes
- forced pass / multiple passes
- blocked win
- blocked tie -> 2-point next hand -> 6-6 poses
- partner poser choice
- disconnect/reconnect inside 90 seconds
- disconnect timeout / open seat
- rematch
- spectator joining before and during game
- iPhone portrait/landscape, Android, tablet, desktop


## V4 rule: Break & Start
Partner games now use Break & Start scoring:
- A team must win 6 consecutive hands to win the match.
- If the opposing team wins, the previous streak is "broke".
- The new winning team starts its own streak at 1.
- Example: Team A wins 1, then Team B wins. Team A's run is broken and Team B starts at 1; Team B's next win makes it 2.
- If a team is at 5 and the other team wins, the five-win streak is broken and the new team starts at 1.
- Partner target is fixed at 6 consecutive wins.


## V5 correction — BRUCK AND START / ONE-ONE PLAY TWO
Partner scoring now follows the corrected state machine:
- Start by playing for 1.
- Same team keeps winning: it goes 1, 2, 3, 4, 5, then 6 wins the game.
- If a team is already on 2 or more and the other team wins, that is BRUCK:
  the running score is cleared, and the next hand starts again playing for 1.
- If Team A goes 1 and Team B wins the next hand, it is ONE-ONE.
- ONE-ONE means the next hand is ONE-ONE PLAY TWO.
- Whoever wins ONE-ONE PLAY TWO becomes the team that has gone 2.
- The first team to go 6 wins.


## V6 — Offline Bruck & Start
The local/offline Partner game now uses the same Bruck & Start rules as online:
- First team to go 6 wins.
- Same team can go 1, 2, 3, 4, 5, 6.
- If the running team is on 2 or more and the other team wins, the run is BRUCK and the next hand starts playing for 1.
- If one team goes 1 and the other team wins the next hand, it is ONE-ONE.
- The following hand is ONE-ONE PLAY TWO.
- Whoever wins that hand goes 2.
- Existing blocked-tie behavior remains in place.

## V7 — Game-management rules
The in-game Rules panel now documents:
- 90-second disconnect/reconnect pause
- leaving an active match
- inactive/AFK behavior
- 10/12/15-second timer
- automatic pass
- server-validated legal moves
- winning-team poser choice
- blocked-tie 2-point / double-six poser rule
- private online hands
- lobby READY requirement and host controls
- host fairness
- match history
- spectators
- unanimous rematch voting

The core Bruck and Start / One-One Play Two scoring rules are unchanged.


## Render deployment
This folder is ready to deploy as a Render Web Service.

Settings:
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`
- Server binds to `0.0.0.0` and uses Render's `PORT`
- WebSockets are handled by the same Node/Socket.IO service

Recommended deployment flow:
1. Put this folder in a GitHub, GitLab, or Bitbucket repository.
2. In Render, choose New > Web Service.
3. Connect the repository.
4. Render can read `render.yaml`, or enter `npm install` and `npm start` manually.
5. Deploy.
6. Open the assigned `onrender.com` URL on iPhone Safari.
7. Test Single Player first, then create an Online room and test four devices.

Important:
- The free Render service can spin down after inactivity.
- Active rooms are currently stored in server memory, so a server restart can end active rooms.

## Table voice chat

Seated online players can tap **Join Voice**, allow microphone access, and talk
with the other players who join voice in the same room (up to four people).
**Mute mic** silences outgoing audio. **Leave Voice** stops the microphone without
leaving the game. Leaving the game, closing the page, or losing the socket
connection stops microphone tracks and peer connections. Spectators are excluded.
No audio is recorded or stored by this application. Production requires HTTPS;
localhost works for development. A browser that blocks autoplay shows a
**Tap to hear players** button.

Voice uses WebRTC, with Socket.IO only carrying room-scoped signaling. For reliable
connections between mobile networks and restrictive Wi-Fi, configure an authenticated
TURN service in the host environment:

- `VOICE_TURN_URLS`: comma-separated `turn:` / `turns:` URLs from the provider.
- Either `VOICE_TURN_USERNAME` + `VOICE_TURN_CREDENTIAL` (provider credentials),
  or `VOICE_TURN_SECRET` (a coturn-compatible REST shared secret). The shared-secret
  option generates one-hour credentials and does not send the shared secret to browsers.

Without TURN configuration, voice attempts direct connections using STUN; some
network combinations will not connect. Do not describe cross-network calling as
verified until it is tested with real phones on separate networks. The browser
checks use synthetic microphone audio on local Chromium, not real iPhone microphones.

## Cut Throat — First to 6

Use **Cut Throat — First to 6** for a local game against three computer
players, or choose **Cut Throat — First to 6** when creating an online room.
Every player keeps an independent running score. Normal wins are worth one;
there is no bruck reset or partner poser selection. The first score to reach six
ends the match, and the display never exceeds six.

Before starting, choose the blocked-tie rule (a tie means two or more players share
the lowest pip count):

- **Play for 2 — double-six poses:** no points for the tied hand; on the next deal,
  the double-six holder automatically poses 6–6 and that hand is worth two points.
- **Play for 1 — previous hand winner poses:** no points for the tied hand; the last
  player who won a hand poses the next hand, which is worth one point. If the first
  hand ties before anyone has won, the double-six holder poses for one point.

A two-point win from five finishes at six, keeping the existing score ceiling.
The host selects the online tie rule before players ready up; it applies to the
whole room and stays selected for a rematch.


## Jamaican 3 Cards

Open `/three-cards.html`, or choose **Jamaican 3 Cards** on the home menu.
This is the owner's rank-matching card game, separate from Domino, without betting.
Choose two, three, or four total players against computers, or start an online table
with two to four connected players.
Online players must each select the same game count (multiples of five) and ready
up before the host starts. At the end they must unanimously choose the same
extension to continue with existing scores.

The 52-card deck is shuffled for every game. Highest dealer pick wins (Ace high;
highest ties repick). Deal three cards each; the next face-up card stays on the
table. Turning up a 6 or Jack awards the dealer one point per seated player.
Before matching-card play, the game automatically checks every hand and announces
every qualifying call. Only the strongest qualifying hand earns call points. No
manual declaration is required. Calls rank:

1. **Flush, straight and threes (3 points each):** three identical ranks > two
   Jacks and a six > two sixes and a Jack. Higher threes beat lower threes. This
   is a special Jamaican category name, not a literal flush plus straight.
2. **Flush and straight (2 points each):** three consecutive cards of one suit.
3. **Flush (1 point each):** three cards of one suit.
4. **Straight (1 point each):** three consecutive ranks.

Same-category ties compare highest, second, then third rank. A-2-3 is the lowest
straight, Q-K-A the highest, and K-A-2 does not qualify. Suits do not break ties.
Each non-winning player pays the call value. A sole three-point caller in a
four-player table gets +9, with each opponent at -3. Exact tied winners divide
the non-winners' payments equally: two tied three-point winners get +3 each,
and two losers get -3 each. Shares can be fractional; if all tie, nobody pays.
The shared engine settles calls once, after the automatic hand checks, then
matching-card play continues for the separate hand-winning points. The server
validates online calls; opponents' unplayed cards remain private until the hand ends. The settled call category, winners, and score changes are shown
on the table. Computers declare qualifying hands automatically.

Starting to the dealer's right, match the face-up rank with your own card and play
one companion card from your hand. That companion is the new rank to match.
A player can decline; priority rotates right. A last matching card plays alone
and wins. With a pair plus a singleton, matching the singleton also wins on that player’s opportunity: match the singleton and clear all three cards, including the pair. This applies to opening cards and draws, including cards another player declines. If the opening card goes unused, the second player to the dealer's
right draws next. Draws stay face up: the drawer has first choice, then others
in rotation. Subsequent unused draws advance to the right.

The hand winner gains one point per opponent (+1, +2 or +3 with two, three or
four players), and every opponent loses one; the winner deals next.
Deck exhaustion is a counted draw with no hand points; call points and the dealer
bonus are kept and everyone picks again for the next dealer. Positive ending scores are
winners, negative scores are losses, and zero is even. Full rules are available
inside the card game.

Online rooms use a separate Socket.IO namespace, server-validated actions, private
hand views and a browser-held reconnect token. Play pauses while any seat is
disconnected. All card session state is in memory; process restarts lose it.
Single-player progress lasts for the current page only. Cross-device/iPhone
Safari play needs actual-device verification.

The card table uses a green oval felt. You sit at the bottom. A two-player game
puts the opponent opposite you; a three-player game puts opponents to either
side; a four-player game uses all four seats. The engine and online lobby allow
two, three, or four players and reject a fifth. Dealer bonuses and call payments
scale with the actual player count.

## Jamaican Draff

Choose **JAMAICAN DRAFF** on the home menu, or open `/draff/`. Draff runs inside
this app with computer, same-device, and two-player online modes. Enter your name
to log in and play for free; no email or password is required. The browser remembers
your display name on this device. Online tables show both players’ names. Names
are display labels, not unique accounts; the saved room token still protects seat
recovery. Create a room
and share its code/invite link. Use **Return to saved room** on the same browser
to reclaim your seat. Both players must request a new game to reset an online
board. Rooms expire after 24 hours and, like the app's other games, are held in
server memory: restarting or deploying the service ends active rooms.

Draff includes the owner's rules: flying kings, backward captures, optional
captures with opponent-claimed **Huff**, no Undo or suggested moves, capture
flashes, and slower computer turns with separate multi-jump steps. Its Jamaican
black/green/gold theme, piece rings, fixed square sizes and mirrored hummingbird
are included. The server validates online actions and room revisions. Draff rooms
use `/api/draff`, independently of Domino and 3 Cards rooms. No extra hosting
service, account, dependency, or environment variable is required.

## LUDI

Choose **LUDI** on the home menu or open `/ludi/`. The board uses black, green and gold, unnamed corner homes,
long continuous stripes, a four-color center with a gold X, and single-file rows
of green, black, red and gold pieces. The photographed track has 48
outer spaces with shared corner squares; the movement engine follows those spaces.
Enter a display name, then choose computer play, friends on the same device, or
an online room for two, three or four players. Two players use opposite corners.
Names are remembered using the same browser name preference as Draff.

This version uses the rules listed inside the game: six to enter, exact rolls to
finish, captures of lone opponents on every shared track square (no safe zones, including starting squares), a capturing piece stops for the rest of the roll (the remaining die must move another piece), protected barriers of two, three, or four pieces that opponents cannot land on or pass, bonus rolls
only for a six after both dice are used (no extra roll for capturing or bringing a piece home). Consecutive sixes have no limit and never forfeit the turn. A roll with no available move
passes automatically. First to bring all four pieces home wins; there are no
teams. Two dice visibly tumble on the table. Tap an unused die, then a piece;
choose either die first, on one piece or split between pieces. Use both whenever legal moves permit it. A capture cannot discard an otherwise playable smaller die just because the capturing piece must stop; another piece must use it unless the remaining move is genuinely blocked. A six
can bring a piece out and the other die can move it. Unusable remaining dice are
skipped. Computer rolls and moves are separated by deliberate pauses.

Online rooms use `/api/ludi` on the existing Express service. The host chooses
the player count; every seat must be filled before the host starts. Dice are
rolled on the server, actions are validated against the current turn and room
revision, and a secret browser-held token recovers each seat. A room code or a
display name alone cannot reclaim an occupied seat. Copy the invite link or
share the code. All players must request a new game before the board resets.
The server automatically rolls or plays the next legal move after 10 seconds,
even while a player is disconnected. Rooms expire 24 hours after creation.

Online LUDI rooms persist across server restarts and deploys when durable storage
is enabled. The existing Render service's persistent disk at `/var/data` enables
this automatically, using `/var/data/ludi-rooms`. For another persistent mount or
local restart testing, set `LUDI_STATE_DIR` to an absolute directory outside
`public/`. An ordinary ephemeral hosting directory will not survive a deploy.
Without this setting or `/var/data`, local development uses memory only.

Each accepted room creation, join, move, roll, rematch vote and automatic action
is saved atomically before it is acknowledged. Snapshots retain names, hashed
seat credentials, the complete board, remaining dice, turn, revision and rematch
votes. No raw seat tokens are stored in these snapshots. After restarting, active
rooms resume from the saved board with a fresh 10-second action window, without
playing missed turns from the downtime. Use **Return to saved room** in the same
browser to recover your seat. A failed save rejects the action without advancing
the in-memory board. Invalid or unreadable snapshots stop startup instead of
silently discarding rooms. Completed games remain available for rematch until
the room expires.

This disk-backed storage supports the existing single service instance. It is
not a shared datastore for multiple server instances. No new dependency or
hosting resource is required on the current Render service.
Physical iPhone Safari and real-phone multiplayer need device verification.


### LUDI turn and result indicators

The active player has a countdown beside their name and above the board. Human
rolls and moves count down from ten seconds; computer turns show their actual
shorter pause. Online clocks use the server deadline and clock offset, so polling
or choosing a die does not restart them. Clocks hide during dice animation,
a connection interruption, and after the game finishes.

Online tables show **Connected**, **Reconnecting…**, and **Back online**. Temporary
outages preserve the saved seat and board; requests time out and polling retries
without overlapping requests. Controls wait for a fresh connection before play
resumes. The winner panel names the winner and provides **Play again** locally or
**Request rematch** online, with each player's Ready/Waiting vote. Online games
restart only after every player agrees.

### LUDI public play, player records and guided practice

Choose **Online · public table** and **Play online** to join the earliest waiting
public table for the selected 2–4-player count. A full table starts automatically;
additional players get another table. Private room codes stay separate. **Cancel
search** removes a waiting seat. Searches that stop checking in for 45 seconds
are removed so disconnected browsers do not block a queue. Restored waiting
rooms get a fresh check-in window after a server restart. Selecting Play online
again with the same saved player returns to that player's current public seat.

Online play automatically saves a player profile in the browser. **Your player
record** shows completed online games, wins and win rate. The leaderboard lists
up to 20 players by wins, then win rate and games played. A name alone cannot
recover a profile: keep its private recovery code and use **Use recovery code**
on another browser. Profile identifiers and credential hashes are saved on the
existing persistent disk; raw profile tokens are kept only by the player's
browser/recovery code. Practice and tutorial results do not affect the online
leaderboard, and pre-profile games are not backfilled.

The server records completed games between saved profiles, including private
rooms. Results are keyed by a unique match ID, so reconnects, repeated requests
and restarts do not duplicate wins. An atomic room snapshot retains any pending
result until it is archived; startup and cleanup reconcile that result before
expiring the room. Player records remain after the room's 24-hour expiry.

**Learn to play · guided practice** teaches entry with a six, using both dice,
capturing a lone piece, respecting barriers, and finishing with an exact roll.
The five interactive steps use the same movement engine as ordinary play, with
fixed practice rolls and no action countdown. Players can exit at any time or
start a full computer game after completing the tutorial.

### LUDI move explanations and problem reports

Tap one of your blocked pieces or an unusable die to see the reason: entry needs
a six, an exact finish would be overshot, a protected barrier blocks the path,
a piece already captured this roll, a die was used, or a different order is
required to use both dice. These explanations use the movement engine's legality
checks and never move a piece or restart the action countdown.

**Report a problem** freezes the current board, dice, selected die, attempted move
and up to eight recent board states when the form opens. The game continues while
the player describes the issue. **Save report** writes a private snapshot on the
existing persistent disk and returns a report ID. For an authenticated online
seat, the saved record also includes the server's board and revision at receipt,
separately from the frozen client view. Client data is not trusted as game state
and cannot alter a room, score or leaderboard.

Reports include basic viewport/browser information but no automatically captured
seat tokens, profile credentials, recovery codes or browser storage. There is no
public report-reading endpoint. A report can be downloaded as JSON or copied
and shared with the problem description. The last report is also kept in the
same browser and can be reopened from **Last problem report** after reloading;
if saving online fails, the player can retry or download/copy the captured report.
Identical retries reuse the same report ID. Report requests have a separate
96 KiB limit; ordinary game actions retain their 4 KiB limit. Private report
storage accepts up to 1,000 reports before asking players to download instead.
