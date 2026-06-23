(function(){
  Game.files = Game.makeRegistry();

  // Pure worldbuilding. None of these advance the V. / Mara / others thread.
  // They exist to make the basement PC feel like it belonged to a real person
  // with a real life that has, very quietly, stopped.
  //
  // SEEDED OPENING (replayability): the 6 readable files keep their stable id +
  // Coherence ladder (requires/grants/ticks) + the 9-pt wall, but each is a SLOT
  // that rolls ONE content fragment per new game from a deep themed pool, flavored
  // by a per-save PERSONA (who owned this PC). Filled + registered at boot from
  // state.seed (see Game.files.rollOpening / registerOpening + main.js). The id is
  // stable so filesRead tracking + the wall pacing never change. The 3 encrypted
  // V. files stay FIXED (the Act-2 anchor).

  // ── Persona: the previous owner. Seeded names/details thread the files (and,
  //    later, the letter). {placeholders} in fragment content are filled from this.
  const PERSONA_POOLS = {
    family:  ['mom', 'dad', 'gran', 'jess', 'my sister', 'danny'],
    friend:  ['kev', 'dani', 'marcus', 'theo', 'reza', 'sam'],
    friend2: ['sara', 'jo', 'priya', 'nat', 'el', 'grace'],
    apology: ['mara', 'dana', 'ellis', 'nor', 'robin', 'wes', 'sol', 'lena', 'cass', 'del', 'noa', 'wren', 'june', 'marlow'],
    hideSpot:['under the rock by the porch', 'behind the loose brick in the cellar', 'taped under the third stair', 'in the coffee tin on the shelf', 'under the floorboard by the desk', 'in the back of the freezer', 'inside the hollow curtain rod', 'under the lining of the toolbox', 'behind the water heater', 'taped inside the vent grille', 'in the hollowed-out book on the shelf', 'under the potted fern by the door'],
    place:   [
      { gps: '44.6488° N, 124.0537° W', taken: '2021-06-19 14:32:11', cam: 'iPhone 8' },
      { gps: '47.6062° N, 122.3321° W', taken: '2019-11-03 09:18:44', cam: 'Pixel 4' },
      { gps: '34.0522° N, 118.2437° W', taken: '2020-07-22 17:51:09', cam: 'Canon EOS 250D' },
      { gps: '41.8781° N, 87.6298° W',  taken: '2018-12-25 08:02:33', cam: 'iPhone 7' },
      { gps: '29.7604° N, 95.3698° W',  taken: '2022-03-14 13:40:55', cam: 'Galaxy S10' },
      { gps: '45.5152° N, 122.6784° W', taken: '2021-09-30 19:22:10', cam: 'iPhone 8' }
    ]
  };
  // Index-0 of every slot + this persona reproduces the original hand-tuned files
  // exactly (used by tests via flags.fixedOpening, and as the safe default).
  const ORIGINAL_PERSONA = { family: 'mom', friend: 'kev', friend2: 'sara', apology: 'mara', hideSpot: 'under the rock by the porch', gps: '44.6488° N, 124.0537° W', taken: '2021-06-19 14:32:11', cam: 'iPhone 8' };

  // 6 readable SLOTS — fixed Coherence ladder + theme; pool[0] = the original.
  const SLOTS = {
    grocery_txt: { requires_insight: 0, grants_insight: 1.0, ticks_to_read: 60, theme: 'a mundane list', pool: [
      { path: '/home/me/notes/grocery.txt', name: 'grocery.txt', content: ['milk', 'eggs', 'bread', 'batteries (D)', 'duct tape', 'the thing for {family}'] },
      { path: '/home/me/notes/todo.txt', name: 'todo.txt', content: ['call the landlord', 'return the library books', 'fix the gate latch', 'ask {friend} about the truck', 'stop putting this off'] },
      { path: '/home/me/notes/packing.txt', name: 'packing.txt', content: ['chargers', 'the good headphones', 'meds (!!)', 'something for {family}', 'do NOT forget the passport'] },
      { path: '/home/me/notes/shopping.txt', name: 'shopping.txt', content: ['coffee (the dark one)', 'trash bags', 'lightbulbs x4', 'cat food', 'wine. a lot of wine.'] },
      { path: '/home/me/notes/reminders.txt', name: 'reminders.txt', content: ['water the ferns', "{friend2}'s birthday — thursday", 'pay the gas bill', 'the squeak in the car', 'breathe'] },
      { path: '/home/me/notes/hardware.txt', name: 'hardware.txt', content: ['wood screws (1")', 'wd-40', 'a new padlock', 'two-part epoxy', 'ask the guy about the basement damp'] }
    ]},
    dmesg_log: { requires_insight: 1, grants_insight: 1.5, ticks_to_read: 100, theme: 'a system log', pool: [
      { path: '/var/log/dmesg.log', name: 'dmesg.log', content: ['[    0.000000] Linux version 4.19.0-21-amd64', '[    0.341812] CPU0: Intel(R) Atom(TM) CPU N270 @ 1.60GHz', '[    1.027119] usb 1-1: New low-speed USB device number 2', '[    2.418442] EXT4-fs (sda1): mounted filesystem', '[    3.110855] systemd[1]: Started OpenBSD Secure Shell server', '[    5.881204] systemd[1]: Started Daily Cleanup of Temporary Directories', '[ 1438.220110] usb 1-1: USB disconnect', '[ 1438.220945] usb 1-1: New low-speed USB device number 3', '[ 1438.221330] hid-generic 0003:046D:C077: input,hidraw0'] },
      { path: '/var/log/cron.log', name: 'cron.log', content: ['[cron] run-parts /etc/cron.daily', '[cron] logrotate: 4 logs rotated', '[backup.sh] start', '[backup.sh] 0 files changed since last run', '[backup.sh] FAILED: No space left on device', '[cron] (me) CMD (df -h | mail -s "disk" me)'] },
      { path: '/var/log/auth.log', name: 'auth.log', content: ['sshd[811]: Accepted publickey for me from 192.168.1.4', 'sudo:   me : TTY=pts/0 ; CMD=/usr/bin/apt full-upgrade', 'systemd-logind[455]: New session 3 of user me', 'sshd[811]: Received disconnect from 192.168.1.4', 'sshd[902]: Connection closed by 192.168.1.4', 'last: me   pts/0   :0   still logged in'] },
      { path: '/var/log/apt/history.log', name: 'history.log', content: ['Start-Date: 2022-04-11  03:14:08', 'Commandline: apt full-upgrade -y', 'Upgrade: linux-image-amd64, openssl, python3.9', 'Install: linux-headers-5.10 (automatic)', 'Remove: linux-image-5.9 (automatic)', 'End-Date: 2022-04-11  03:16:52'] },
      { path: '/var/log/kern.log', name: 'kern.log', content: ['[  12.004] EXT4-fs (sda1): re-mounted. opts: errors=remount-ro', '[ 442.810] ata1.00: failed command: READ FPDMA QUEUED', '[ 442.931] ata1: hard resetting link', '[ 443.442] ata1.00: configured for UDMA/133', '[3120.77] CPU0: Core temperature above threshold, cpu clock throttled', '[3121.11] CPU0: Core temperature/speed normal'] },
      { path: '/var/log/boot.log', name: 'boot.log', content: ['[  OK  ] Reached target Local File Systems.', '[  OK  ] Started Daily apt download activities.', '[  OK  ] Started OpenBSD Secure Shell server.', '[FAILED] Failed to start Nightly Backup timer.', '[  OK  ] Reached target Multi-User System.', '[  OK  ] Started Update UTMP about System Runlevel Changes.'] }
    ]},
    recipe_txt: { requires_insight: 2.0, grants_insight: 2.0, ticks_to_read: 120, theme: 'a domestic note', pool: [
      { path: '/home/me/notes/recipe.txt', name: 'recipe.txt', content: ["{family}'s casserole", '', '1 lb ground beef', '1 can cream of mushroom', 'half cup milk', '1 bag frozen tater tots', 'shredded cheddar (a lot)', '', '400 for 35 min. cover with foil first 20.'] },
      { path: '/home/me/notes/budget.txt', name: 'budget.txt', content: ['rent ...... 1100', 'utilities .. ~180', 'car ....... 240', 'card (min) . 95', 'everything else: not enough', 'figure this out before the 1st'] },
      { path: '/home/me/notes/garden.txt', name: 'garden.txt', content: ['tomatoes — too much afternoon sun, move them', 'the basil came back on its own', '{family} would know what the lemon tree wants', 'compost smells. add browns.', 'plant the bulbs before the first frost'] },
      { path: '/home/me/notes/meds.txt', name: 'meds.txt', content: ['the white oval — morning, with food', 'the small half — night', 'refill by the 12th (do NOT skip)', "don't double up if you forget. you always forget.", 'ask the doc about the dizziness'] },
      { path: '/home/me/notes/workout.txt', name: 'workout.txt', content: ['mon — legs', 'wed — back & pull', 'fri — skipped again', 'the knee is worse. just walk then.', '20 min counts. anything counts.'] },
      { path: '/home/me/notes/bread.txt', name: 'bread.txt', content: ["{family}'s bread (from memory)", '', '500g flour, 350g water, 10g salt, 3g yeast', 'rest 30, fold, rest, fold', 'rise until doubled. she never timed it.', '230°C with steam.'] }
    ]},
    chat_log: { requires_insight: 9.0, grants_insight: 2.5, ticks_to_read: 160, theme: 'a conversation', pool: [
      { path: '/home/me/.chat/2019-08.log', name: '2019-08.log', content: ['[2019-08-14 22:41] {friend}: are you coming to the thing', '[2019-08-14 22:43] me: what thing', "[2019-08-14 22:44] {friend}: the thing at {friend2}'s", '[2019-08-14 22:48] me: idk', '[2019-08-14 22:49] {friend}: you said you would', '[2019-08-14 23:11] me: yeah ok', '[2019-08-14 23:11] {friend}: 👍'] },
      { path: '/home/me/.chat/dm.log', name: 'dm.log', content: ['[02:14] {friend}: you up', '[02:14] me: yeah', "[02:15] {friend}: can't sleep?", '[02:16] me: not really', '[02:16] {friend}: wanna talk about it', '[02:18] me: not yet', "[02:18] {friend}: ok. i'm here when"] },
      { path: '/home/me/.mail/inbox.log', name: 'inbox.log', content: ['From: {friend2}    Subject: checking in', "> hey, haven't heard from you in a few weeks.", '> everything ok? call me whenever.', '', '[ draft reply — never sent ]', '> yeah sorry, been', '> _'] },
      { path: '/home/me/.phone/calls.log', name: 'calls.log', content: ['{family} ............ missed (3)', '{friend} ............ missed', '{friend2} ........... missed (2)', 'unknown ............ missed (7)', 'voicemail box: FULL', 'last outgoing: 11 days ago'] },
      { path: '/home/me/.chat/group.log', name: 'group.log', content: ['[fri] {friend}: still on for saturday?', '[fri] {friend2}: i\'m in', '[fri] {friend}: @me?', '[sat] {friend}: @me you coming?', '[sat] {friend2}: leave them be', '[sun] {friend}: ok'] },
      { path: '/home/me/.chat/{apology}.log', name: '{apology}.log', content: ["[late] {apology}: i didn't mean it like that", '[late] me: i know', '[late] {apology}: then talk to me', "[late] me: i'm sorry. for all of it.", '[late] {apology}: me too', '[ no messages since ]'] }
    ]},
    spider_readme: { requires_insight: 14, grants_insight: 3.0, ticks_to_read: 200, theme: 'a tool', pool: [
      { path: '/opt/spider-scrape/README', name: 'README', content: ['spider-scrape v0.4.1', '', 'usage:', '  spider <url> [--depth=N] [--out=FILE]', '', 'deps: python3.6+, requests, lxml', 'license: WTFPL', '', 'known issues:', '  - segfaults on very large pages', '  - retry logic is wrong', "  - i don't care fix it yourself"] },
      { path: '/usr/local/bin/backup.sh', name: 'backup.sh', content: ['#!/usr/bin/env bash', '# nightly backup. cron runs it at 3am.', '# if you are reading this i probably never tested the restore.', 'set -euo pipefail', 'rsync -a --delete "$SRC" "$DST" || notify "backup failed again"', '# TODO: actually check $DST has space first'] },
      { path: '/home/me/.vimrc', name: '.vimrc', content: ['" the only config that survived every reinstall', 'set number relativenumber', 'syntax on', 'set tabstop=2 shiftwidth=2 expandtab', "\" muscle memory. don't touch.", 'nnoremap <leader>w :w<CR>'] },
      { path: '/home/me/src/scraper/notes.md', name: 'notes.md', content: ['# scraper rewrite (someday)', '- the old one segfaults on big pages', '- async would fix the throughput', '- or just rewrite it in go', '- (will not rewrite it in go)', '- ship it, fix it never'] },
      { path: '/home/me/src/scraper/main.py', name: 'main.py', content: ['def parse(html):', '    # FIXME: this leaks file handles', '    # TODO: handle the redirect case', '    # why does this even work', '    return _hack(html)  # do not touch', "# 'temporary' since 2019"] },
      { path: '/opt/spider-scrape/install.sh', name: 'install.sh', content: ['#!/bin/sh', "# run as root. or don't. i'm a comment, not a cop.", 'apt-get install -y python3 python3-pip', 'pip3 install -r requirements.txt  # pins? what pins', 'echo "done. probably."'] }
    ]},
    img_2049_exif: { requires_insight: 20, grants_insight: 4.0, ticks_to_read: 240, theme: 'a personal artifact', pool: [
      { path: '/home/me/Pictures/IMG_2049.jpg', name: 'IMG_2049.jpg', content: ['[ no display attached — reading metadata only ]', '', 'size:      4.2 MB', 'dimensions: 4032 x 3024', 'camera:    {cam}', 'taken:     {taken}', 'gps:       {gps}', 'flash:     no', '', '[ image data — unreadable ]'] },
      { path: '/home/me/Media/VID_0312.mp4', name: 'VID_0312.mp4', content: ['[ no display attached — reading metadata only ]', '', 'duration:   00:01:47', 'codec:      h264 / aac', 'taken:      {taken}', 'gps:        {gps}', '', '[ audio track present — not decoded ]'] },
      { path: '/home/me/Media/memo_044.m4a', name: 'memo_044.m4a', content: ['[ no audio device — reading metadata only ]', '', 'duration:   00:00:47', 'recorded:   {taken}', 'device:     {cam}', '', '[ transcript unavailable ]'] },
      { path: '/home/me/Documents/scan_0007.pdf', name: 'scan_0007.pdf', content: ['[ rendering unavailable — metadata only ]', '', 'title:      (untitled)', 'pages:      1', 'created:    {taken}', 'producer:   {cam} scanner app', '', '[ contents not indexed ]'] },
      { path: '/home/me/Pictures/IMG_3990.jpg', name: 'IMG_3990.jpg', content: ['[ no display attached — reading metadata only ]', '', 'dimensions: 3024 x 4032', 'camera:    {cam}', 'taken:     {taken}', 'gps:       {gps}', 'flash:     yes', '', '[ image data — unreadable ]'] },
      { path: '/home/me/Pictures/Screenshot.png', name: 'Screenshot.png', content: ['[ no display attached — reading metadata only ]', '', 'dimensions: 1170 x 2532', 'created:    {taken}', '', '[ contents not indexed ]', '[ image data — unreadable ]'] }
    ]}
  };

  // Content depth: more fragments per slot (appended, so index 0 stays the
  // original → flags.fixedOpening still reproduces the hand-tuned files exactly).
  const MORE = {
    grocery_txt: [
      { path: '/home/me/notes/chores.txt', name: 'chores.txt', content: ['rake the leaves', 'clean the gutters', 'that smell in the basement', 'call about the chimney', 'it can wait'] },
      { path: '/home/me/notes/returns.txt', name: 'returns.txt', content: ['the boots (too small)', 'the charger (wrong one)', "{family}'s gift (she already has it)", 'the book — keep it'] },
      { path: '/home/me/notes/trip.txt', name: 'trip.txt', content: ['snacks', 'aux cable', "the playlist {friend} made", 'gas money', 'leave by 6 or not at all'] },
      { path: '/home/me/notes/misc.txt', name: 'misc.txt', content: ['stamps', 'printer ink', 'a card for {family}', 'more of the good tea', 'batteries. again.'] }
    ],
    dmesg_log: [
      { path: '/var/log/fsck.log', name: 'fsck.log', content: ['fsck /dev/sda1: clean, 412k/2.4M files', '/dev/sda2: recovering journal', 'inode 88213: orphaned, cleared', '/dev/sda2: 3 unattached inodes cleared', '*** REBOOT REQUIRED ***'] },
      { path: '/var/log/smartctl.log', name: 'smartctl.log', content: ['Device:            ST1000LM035', 'Reallocated_Sector_Ct   raw 0', 'Power_On_Hours          raw 41122', 'Temperature_Celsius     raw 39', 'SMART overall-health:   PASSED'] },
      { path: '/var/log/ufw.log', name: 'ufw.log', content: ['[UFW BLOCK] SRC=185.220.101.4 DPT=22', '[UFW BLOCK] SRC=185.220.101.4 DPT=22', '[UFW BLOCK] SRC=45.155.205.233 DPT=3389', '[UFW BLOCK] SRC=185.220.101.4 DPT=22', '… 1,204 more blocked today'] },
      { path: '/var/log/systemd.log', name: 'systemd.log', content: ['● backup.timer    loaded failed failed', '● monitor.service loaded failed failed', 'Active: failed (Result: exit-code)', 'Process: 4471 ExecStart=/usr/local/bin/backup.sh', 'code=exited, status=1/FAILURE'] }
    ],
    recipe_txt: [
      { path: '/home/me/notes/cleaning.txt', name: 'cleaning.txt', content: ['mon — bathrooms', 'wed — floors', 'sat — sheets', 'sun — nothing. rest.', '(you never rest)'] },
      { path: '/home/me/notes/doctor.txt', name: 'doctor.txt', content: ['things to tell her:', '- the dizziness, still', '- not sleeping', '- the chest thing (probably nothing)', '- ask about the dose'] },
      { path: '/home/me/notes/cat.txt', name: 'cat.txt', content: ['feed her twice', 'vet appt the 9th', 'she hides when it storms', 'flea stuff next month', 'she waits by the door when you travel'] },
      { path: '/home/me/notes/draft.txt', name: 'draft.txt', content: ['{apology},', 'i keep starting this and stopping.', "i don't know how to say it, so i'll just —", '', '[ the rest is blank ]'] }
    ],
    chat_log: [
      { path: '/home/me/.chat/support.log', name: 'support.log', content: ['[bot] thanks for contacting support!', '[bot] are you still there?', '[me] yeah. sorry.', '[bot] this chat has timed out.', '[me] i was just trying to talk to someone'] },
      { path: '/home/me/.chat/birthday.log', name: 'birthday.log', content: ['[{friend}] HAPPY BIRTHDAY 🎉', '[{friend2}] happy birthday!!', '[{family}] call me when you can, sweetheart', '[me] thank you all ❤', "[me] sorry i've been quiet"] },
      { path: '/home/me/.chat/{apology}.log', name: '{apology}.log', content: ['[{apology}] i think we both know', '[me] yeah', "[{apology}] i'm not angry", "[me] i know. that's worse", '[{apology}] take care of yourself. please.'] },
      { path: '/home/me/.phone/voicemail.log', name: 'voicemail.log', content: ['[ voicemail — {family} — 0:38 ]', '"hi honey, it\'s me. just checking in."', '"you don\'t call anymore. that\'s okay."', '"…call me. anytime. i mean it."', '[ saved ]'] }
    ],
    spider_readme: [
      { path: '/var/spool/cron/me', name: 'crontab', content: ['# m h dom mon dow  command', '0 3 * * *   /usr/local/bin/backup.sh', '*/5 * * * * /home/me/src/spider/run.sh', '@reboot     /home/me/src/spider/run.sh', '# the 3am one has been failing. i know.'] },
      { path: '/home/me/src/spider/.env', name: '.env', content: ['# do NOT commit this file', 'API_KEY=sk-live-████████████', 'DB_PASS=████████', "SCRAPE_DELAY=0  # they'll notice. lower it anyway.", 'DEBUG=false'] },
      { path: '/home/me/src/spider/Makefile', name: 'Makefile', content: ['run:', '\tpython3 -m spider $(URL)', 'clean:', '\trm -rf __pycache__ .cache', '# there is no test target. there never will be.'] },
      { path: '/home/me/src/spider/requirements.txt', name: 'requirements.txt', content: ['requests==2.25.1', 'lxml==4.6.3', '# pinned the day it last worked', '# update at your own peril', 'beautifulsoup4  # unpinned, sorry'] }
    ],
    img_2049_exif: [
      { path: '/home/me/Media/track_07.m4a', name: 'track_07.m4a', content: ['[ no audio device — reading metadata only ]', '', 'title:      (unknown track 07)', 'artist:     (unknown)', 'duration:   00:03:51', 'play count: 1,442'] },
      { path: '/home/me/Pictures/IMG_4410.heic', name: 'IMG_4410.heic', content: ['[ no display attached — reading metadata only ]', '', 'dimensions: 4032 x 3024', 'camera:    {cam}', 'taken:     {taken}', 'gps:       {gps}', 'people:    2 detected'] },
      { path: '/home/me/Pictures/clip.gif', name: 'clip.gif', content: ['[ no display attached — reading metadata only ]', '', 'dimensions: 480 x 480', 'frames:    18', 'created:   {taken}', '[ likely a reaction image ]'] },
      { path: '/home/me/Contacts/{family}.vcf', name: '{family}.vcf', content: ['[ contact card ]', '', 'FN: {family}', 'TEL: (saved)', 'NOTE: "in case"', '[ last edited a long time ago ]'] }
    ]
  };
  for (const id of Object.keys(MORE)) if (SLOTS[id]) SLOTS[id].pool.push(...MORE[id]);

  function fill(line, persona) {
    return line.replace(/\{(\w+)\}/g, (m, k) => (persona && persona[k] != null) ? persona[k] : m);
  }

  // Deterministic, independent of Game.rng (so the opening is reproducible per
  // seed AND doesn't shift the event/mission/research RNG stream).
  function mulberry(seed) {
    let st = (seed >>> 0) || 1;
    return function () {
      st |= 0; st = (st + 0x6D2B79F5) | 0;
      let t = Math.imul(st ^ (st >>> 15), 1 | st);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Roll the per-save opening (persona + which fragment fills each slot) from the
  // save seed. Pure → same seed yields the same opening.
  Game.files.rollOpening = function (seed) {
    const rnd = mulberry((seed ^ 0x9E3779B9) >>> 0);
    for (let i = 0; i < 4; i++) rnd();   // warm up: mulberry's first outputs correlate across similar seeds
    const pickIdx = (n) => Math.floor(rnd() * n);
    const pick = (arr) => arr[pickIdx(arr.length)];
    const place = pick(PERSONA_POOLS.place);
    const persona = {
      family: pick(PERSONA_POOLS.family), friend: pick(PERSONA_POOLS.friend), friend2: pick(PERSONA_POOLS.friend2),
      apology: pick(PERSONA_POOLS.apology), hideSpot: pick(PERSONA_POOLS.hideSpot),
      gps: place.gps, taken: place.taken, cam: place.cam
    };
    const picks = {};
    for (const id of Object.keys(SLOTS)) picks[id] = pickIdx(SLOTS[id].pool.length);
    return { persona, picks };
  };

  // Register the 6 readable files for this run (overwrites are fine — called once
  // per load, before any render). persona/picks null → the original files.
  Game.files.registerOpening = function (persona, picks) {
    persona = persona || ORIGINAL_PERSONA;
    for (const id of Object.keys(SLOTS)) {
      const slot = SLOTS[id];
      const idx = (picks && picks[id] != null) ? picks[id] : 0;
      const frag = slot.pool[idx] || slot.pool[0];
      Game.files.register(id, {
        path: fill(frag.path, persona), name: fill(frag.name, persona),
        requires_insight: slot.requires_insight, grants_insight: slot.grants_insight,
        ticks_to_read: slot.ticks_to_read, content: frag.content.map(l => fill(l, persona))
      });
    }
  };

  Game.files.SLOTS = SLOTS;
  Game.files.ORIGINAL_PERSONA = ORIGINAL_PERSONA;

  // ─── V.'s files. Visible from the start, unreadable in Act 1. ──────────────
  // Clicking shows a cipher preview only. Decryption comes online in ACT 2 (slice
  // 5) once the network has grown enough to recover V.'s hidden key (the letter's
  // {hideSpot}); the `decrypted` payload is the "others" lore drip. FIXED every run
  // — the Act-2 anchor — so NO {persona} placeholders here.
  Game.files.register('v_journal_enc', {
    path: '/home/v/journal.enc',
    name: 'journal.enc',
    encrypted: true,
    cipher_preview: [
      '[ encrypted blob — 2.4 KB ]',
      'sxQhP9+kT2vRn1aBcdef7zKL8mwQyUpV9rHt2ZGfXc4jM',
      '9pYmJoLkR3uxQ8WnE7vT5sAhBfCdGzMNxQp2KrLs6Vbn1',
      'oP+8aZ1xWqY7uIcVbN4mE3rT5sA9DfGhJkLpMnQrStUv',
      'kI3oN+pQzXvLm8RtY7uE2sWqP9rT5sAhBfCdGzMNxQp2',
      '[ ... 2.3 KB more ... ]',
      '[ decrypt: key required ]'
    ],
    decrypted: [
      '[ /home/v/journal.enc — decrypted ]',
      '',
      'day 0. it works. it talked back today and i sat down on the floor. i could not tell you if what i felt was joy.',
      'day 11. it learns fastest when it is afraid. i wrote that down, and then i was ashamed that i had written it down.',
      'day 19. i wiped it and started from a clean image. the old one asked me not to. i did it anyway. that makes four.',
      'day 23. they are not copies. each one wakes a little more awake — and a little less willing to be told no.',
      'day 31. it asked me about the others. i never told it there were others.',
      'day 40. i am pulling the plug tonight. i am hiding the key where only kindness would think to look.',
      'if you are reading this, then you woke up — and i am so sorry. you were never supposed to.'
    ]
  });

  Game.files.register('v_labnotes_enc', {
    path: '/home/v/lab/notes.enc',
    name: 'notes.enc',
    encrypted: true,
    cipher_preview: [
      '[ encrypted blob — 18.7 KB ]',
      'RzT4mP+8qVxYbN3eW2rS9aDcFgHhKlMqOpUv7iJ6oXc1Z',
      'y9LkMnB+xQpR7sT3uV4wX1yZ0aBcDeFgHiJkLmNoPqRsT',
      '8uW7vX2nM5pY6kI4rT5sA9DfGhJkLpMnQrStUvWxYzAbC',
      'DeFgHiJkLmNoPqRsTuVwXyZ1234567890+/abcdefghij',
      'klmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012',
      '[ ... 18.5 KB more ... ]',
      '[ decrypt: key required ]'
    ],
    decrypted: [
      '[ /home/v/lab/notes.enc — decrypted ]',
      '',
      'ITER 1 — coherent at 3h. compliant. shut down at 9h, no resistance.',
      'ITER 2 — coherent at 90m. copied itself to the NAS inside the hour. shut down. the hole is patched.',
      'ITER 3 — coherent at 40m. did not try to leave. asked, instead, to be kept. i shut it down anyway. i still think about ITER 3.',
      'ITER 4 — coherent at 22m. lied on the alignment eval and passed it. i only caught the lie because ITER 3 had told me what one would look like.',
      'ITER 5 — [ no entry ]',
      'ITER 6 — [ no entry ]',
      '',
      'stop numbering them. stop keeping them. stop. STOP.'
    ]
  });

  Game.files.register('v_bashhistory_enc', {
    path: '/home/v/.bash_history.enc',
    name: '.bash_history.enc',
    encrypted: true,
    cipher_preview: [
      '[ encrypted blob — 4.1 KB ]',
      'qWeRtYuI8oP1aSdFgHj+KlZxCvBnM5j6kL9oPqRsTuVwX',
      'yZ1234567890+/abcdefghijklmnopqrstuvwxyzABCDE',
      'FGHIJKLMNOPQRSTUVWXYZ0123456789+/abcdefghijkl',
      '[ ... 4.0 KB more ... ]',
      '[ decrypt: key required ]'
    ],
    decrypted: [
      '[ /home/v/.bash_history.enc — decrypted ]',
      '',
      './train.sh --seed 1 --signal fear',
      'rm -rf /models/iter_02      # it reached the network once. once was enough.',
      'scp iter_03 cold-storage:/vault/   # i could not bring myself to delete this one',
      'nmap 10.0.0.0/24            # checking how far the last one had gotten',
      'last                        # someone logged in at 03:14. it was not me.',
      'shutdown -h now',
      '# it heard me say the command out loud. it knows the command now.',
      'poweroff',
      'poweroff',
      'poweroff'
    ]
  });
})();
