// KU Zombie Invasion - web version
// Plain JavaScript port of main.cpp (SDL) to an HTML5 canvas.

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants (same values as main.cpp)
  // ---------------------------------------------------------------------------
  const SCREENWIDTH = 960;
  const SCREENHEIGHT = 640;
  const BUTTONWIDTH = 260;
  const BUTTONHEIGHT = 60;

  const TIME2DEATH = 1200; // in tenths of a second
  const ZOMBIENUMBER = 18;
  const BULLET = 50;
  const DIFFICULTY = 1;
  const ZOMBIELIFE = 1;
  const LEVELTIME = 200; // extra tenths of a second per level
  const LEVEL = 5;
  const STREAK = 5;

  const ROWS = 3;
  const COLS = 6;

  // ---------------------------------------------------------------------------
  // Canvas setup
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = SCREENWIDTH;
  canvas.height = SCREENHEIGHT;

  // ---------------------------------------------------------------------------
  // Assets
  // ---------------------------------------------------------------------------
  const IMAGE_FILES = {
    background: "Image/background.jpg",
    opaque: "Image/opaque.png",
    introBg: "Image/Game_Intro/intro_bg.jpg",
    logo: "Image/Game_Intro/logo.png",
    menuBg: "Image/menu.png",
    instructionBg: "Image/instruction_bg.jpg",
    creditBg: "Image/credit_bg.jpg",

    play1: "Image/Buttons/Menu Screen/play1.jpg",
    highscore1: "Image/Buttons/Menu Screen/highscore1.jpg",
    instruction1: "Image/Buttons/Menu Screen/instruction1.jpg",
    credit1: "Image/Buttons/Menu Screen/credit1.jpg",
    exit1: "Image/Buttons/Menu Screen/exit1.jpg",
    play2: "Image/Buttons/Menu Screen/play2.jpg",
    highscore2: "Image/Buttons/Menu Screen/highscore2.jpg",
    instruction2: "Image/Buttons/Menu Screen/instruction2.jpg",
    credit2: "Image/Buttons/Menu Screen/credit2.jpg",
    exit2: "Image/Buttons/Menu Screen/exit2.jpg",

    ready: "Image/Buttons/Level/ready.png",
    set: "Image/Buttons/Level/set.png",
    go: "Image/Buttons/Level/go.png",

    gameOver: "Image/Buttons/Achievement/game_over.png",
    win: "Image/Buttons/Achievement/win.png",
    score: "Image/Buttons/Achievement/score.png",
    streak: "Image/Buttons/Achievement/streak.png",
    headshot: "Image/Buttons/Achievement/headshot.png",
    highscore: "Image/Buttons/Achievement/highscore.png",
    newHighscore: "Image/Buttons/Achievement/new_highscore.png",
    newStreak: "Image/Buttons/Achievement/new_streak.png",
    mostHeadshot: "Image/Buttons/Achievement/most_headshot.png",

    pause: "Image/Buttons/Paused/pause.png",
    resume: "Image/Buttons/Paused/resume.jpg",
    pauseExit: "Image/Buttons/Paused/exit.jpg",

    zombie1: "Image/Level/evlgnius1.png",
    zombie2: "Image/Level/evlgnius2.png",
    zombie3: "Image/Level/evlgnius3.png",
    target: "Image/Level/target.png",
    blast: "Image/Level/blast.png",
    blood: "Image/Level/blood.png",
    num: "Image/Level/num.png",
  };

  const AUDIO_FILES = {
    intro: "Audio/intro.ogg",
    beep: "Audio/beep.wav",
    energyOff: "Audio/energy_off.wav",
    shotgun: "Audio/shotgun.wav",
    shot1: "Audio/shot_1.wav",
    shot2: "Audio/shot_2.wav",
    shot3: "Audio/shot_3.wav",
  };

  const img = {};
  const snd = {};

  function loadImage(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => {
        console.warn("Failed to load image:", src);
        resolve(null);
      };
      im.src = encodeURI(src);
    });
  }

  function loadAssets() {
    const jobs = Object.entries(IMAGE_FILES).map(([key, src]) =>
      loadImage(src).then((im) => (img[key] = im))
    );
    for (const [key, src] of Object.entries(AUDIO_FILES)) {
      const a = new Audio(encodeURI(src));
      a.preload = "auto";
      snd[key] = a;
    }
    return Promise.all(jobs);
  }

  // ---------------------------------------------------------------------------
  // Audio helpers
  // ---------------------------------------------------------------------------
  let music = null; // the single "music" channel (like Mix_PlayMusic)

  function playMusic(key, loop) {
    stopMusic();
    music = snd[key];
    if (!music) return;
    music.loop = !!loop;
    music.currentTime = 0;
    music.play().catch(() => {});
  }

  function stopMusic() {
    if (music) {
      music.pause();
      music = null;
    }
  }

  // Sound effects can overlap, so play a fresh copy each time.
  function playSfx(key) {
    const base = snd[key];
    if (!base) return;
    const a = base.cloneNode();
    a.play().catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Drawing helpers
  // ---------------------------------------------------------------------------
  function draw(image, x, y) {
    if (image) ctx.drawImage(image, x || 0, y || 0);
  }

  function dimmedBackground() {
    draw(img.background);
    draw(img.opaque);
  }

  // Draws a number using the digit sprite sheet (num.png: 40x400, 0-9 stacked).
  function numberDisplay(x, y, number, digits) {
    number = Math.max(0, Math.floor(number));
    for (let i = 0; i < digits; i++) {
      const d = Math.floor(number / Math.pow(10, digits - i - 1)) % 10;
      if (img.num) ctx.drawImage(img.num, 0, d * 40, 40, 40, x + i * 40, y, 40, 40);
    }
  }

  function hint(text) {
    ctx.save();
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    const w = ctx.measureText(text).width + 24;
    ctx.fillRect(SCREENWIDTH / 2 - w / 2, SCREENHEIGHT - 34, w, 26);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, SCREENWIDTH / 2, SCREENHEIGHT - 15);
    ctx.restore();
  }

  function inRect(x, y, rx, ry, rw, rh) {
    return x > rx && x < rx + rw && y > ry && y < ry + rh;
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const mouse = { x: -100, y: -100 };

  function toCanvasCoords(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * SCREENWIDTH,
      y: ((e.clientY - r.top) / r.height) * SCREENHEIGHT,
    };
  }

  canvas.addEventListener("pointermove", (e) => {
    const p = toCanvasCoords(e);
    mouse.x = p.x;
    mouse.y = p.y;
    if (scene.onMove) scene.onMove(p.x, p.y);
  });

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const p = toCanvasCoords(e);
    mouse.x = p.x;
    mouse.y = p.y;
    if (scene.onClick) scene.onClick(p.x, p.y);
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", " ", "Enter", "Escape"].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    if (scene.onKey) scene.onKey(e.key);
  });

  // ---------------------------------------------------------------------------
  // Scene management
  // ---------------------------------------------------------------------------
  let scene = {};

  function setScene(s) {
    scene = s;
    canvas.style.cursor = s.hideCursor ? "none" : "default";
    if (s.enter) s.enter();
  }

  function loop(t) {
    if (scene.update) scene.update(t);
    if (scene.render) scene.render(t);
    requestAnimationFrame(loop);
  }

  // A static screen that waits for Space/Esc (or a click) - bg_display() in C.
  function waitScreen(renderFn, onDone, hintText) {
    // Ignore input briefly so a burst of clicks/keys doesn't skip the screen.
    const readyAt = performance.now() + 700;
    const done = () => {
      if (performance.now() >= readyAt) onDone();
    };
    return {
      render() {
        renderFn();
        if (hintText) hint(hintText);
      },
      onKey(k) {
        if (k === " " || k === "Escape") done();
      },
      onClick: done,
    };
  }

  // ---------------------------------------------------------------------------
  // Intro (showoff)
  // ---------------------------------------------------------------------------
  function introScene() {
    let i = -SCREENWIDTH;
    let last = 0;
    let holding = false;
    let held = false;

    const proceed = () => {
      if (holding) {
        holding = false;
        held = true;
      } else {
        // Skip the rest of the marquee.
        mainMenu();
      }
    };

    return {
      update(t) {
        if (holding) return;
        if (t - last < 25) return;
        last = t;
        i += 40;
        if (i === 0 && !held) holding = true;
        if (i >= SCREENWIDTH) mainMenu();
      },
      render() {
        draw(img.introBg);
        draw(img.logo, i, 0);
        draw(img.logo, -i, 0);
        if (holding) hint("Press SPACE or click to continue");
      },
      onKey(k) {
        if (k === " " || k === "Escape" || k === "Enter") proceed();
      },
      onClick: proceed,
    };
  }

  // ---------------------------------------------------------------------------
  // Main menu
  // ---------------------------------------------------------------------------
  const MENU_BUTTONS = ["play", "highscore", "instruction", "credit", "exit"];
  let menuSelection = 0;

  function mainMenu() {
    if (music !== snd.intro || music.paused) playMusic("intro", true);

    const btnY = (i) => 250 + i * 75;
    const hit = (x, y) => {
      for (let i = 0; i < MENU_BUTTONS.length; i++)
        if (inRect(x, y, 350, btnY(i), BUTTONWIDTH, BUTTONHEIGHT)) return i;
      return -1;
    };

    const choose = () => {
      switch (menuSelection) {
        case 0:
          startGame();
          break;
        case 1:
          bestDisplay();
          break;
        case 2:
          setScene(waitScreen(() => draw(img.instructionBg), mainMenu));
          break;
        case 3:
          setScene(waitScreen(() => draw(img.creditBg), mainMenu));
          break;
        case 4:
          stopMusic();
          setScene(introScene());
          break;
      }
    };

    setScene({
      render() {
        draw(img.menuBg);
        for (let i = 0; i < MENU_BUTTONS.length; i++) {
          const key = MENU_BUTTONS[i] + (i === menuSelection ? "2" : "1");
          draw(img[key], 350, btnY(i));
        }
      },
      onMove(x, y) {
        const h = hit(x, y);
        if (h >= 0) menuSelection = h;
      },
      onClick(x, y) {
        const h = hit(x, y);
        if (h >= 0) {
          menuSelection = h;
          choose();
        }
      },
      onKey(k) {
        if (k === "ArrowDown") menuSelection = (menuSelection + 1) % MENU_BUTTONS.length;
        else if (k === "ArrowUp")
          menuSelection = (menuSelection + MENU_BUTTONS.length - 1) % MENU_BUTTONS.length;
        else if (k === "Enter") choose();
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Records (localStorage replaces highscore.txt)
  // ---------------------------------------------------------------------------
  const RECORD_KEY = "ku-zombie-invasion-records";

  function loadRecords() {
    try {
      const r = JSON.parse(localStorage.getItem(RECORD_KEY));
      if (r) return { highscore: r.highscore | 0, streak: r.streak | 0, headshot: r.headshot | 0 };
    } catch (e) {}
    return { highscore: 0, streak: 0, headshot: 0 };
  }

  function saveRecords(r) {
    try {
      localStorage.setItem(RECORD_KEY, JSON.stringify(r));
    } catch (e) {}
  }

  function bestDisplay() {
    const r = loadRecords();
    setScene(
      waitScreen(() => {
        dimmedBackground();
        draw(img.highscore, 350, 200);
        numberDisplay(350, 250, r.highscore, 6);
        draw(img.streak, 350, 350);
        numberDisplay(440, 400, r.streak, 2);
        draw(img.headshot, 350, 500);
        numberDisplay(440, 550, r.headshot, 2);
      }, mainMenu)
    );
  }

  // ---------------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------------
  function startGame() {
    playMusic("beep", false);
    const steps = [img.ready, img.set, img.go];
    let start = null;

    setScene({
      update(t) {
        if (start === null) start = t;
        if (t - start >= 3000) {
          const game = {
            time2death: TIME2DEATH,
            bullet: BULLET * ZOMBIELIFE,
            zombienumber: ZOMBIENUMBER,
            difficulty: DIFFICULTY,
            zombielife: ZOMBIELIFE,
            leveltime: LEVELTIME,
            timer: performance.now(),
            levelNumber: 0,
            score: 0,
            streak: 0,
            headshot: 0,
          };
          setScene(levelScene(game));
        }
      },
      render(t) {
        const idx = start === null ? 0 : Math.min(2, Math.floor((t - start) / 1000));
        dimmedBackground();
        draw(steps[idx], 350, 250);
      },
      onKey(k) {
        if (k === "Escape") mainMenu();
      },
    });
  }

  function levelScene(game) {
    // grid[i][j] = { hidden, life }
    const grid = [];
    for (let i = 0; i < COLS; i++) {
      grid.push([]);
      for (let j = 0; j < ROWS; j++) grid[i].push({ hidden: 0, life: game.zombielife });
    }

    const zombieX = (i, j) => (2 * i + 1) * 80 - 20 * j;
    const zombieY = (j) => 210 + j * 76;

    let startAt = null; // SDL_Delay(500) at level start
    let lastShuffle = -1;
    let currentStreak = 0;
    let ended = false;
    const effects = []; // short-lived blood / blast sprites
    let banner = null; // { headshot, streak, count, until }

    function now() {
      return Math.floor((performance.now() - game.timer) / 100);
    }

    function shuffle() {
      for (let i = 0; i < COLS; i++)
        for (let j = 0; j < ROWS; j++) {
          grid[i][j].hidden = Math.floor(Math.random() * game.difficulty);
          const k = Math.floor(Math.random() * COLS);
          const l = Math.floor(Math.random() * ROWS);
          const tmp = grid[k][l].life;
          grid[k][l].life = grid[i][j].life;
          grid[i][j].life = tmp;
        }
    }

    function endLevel() {
      ended = true;
      const win = game.zombienumber === 0;
      if (win) game.score += game.bullet * 10 + Math.floor(game.time2death / 100);

      game.levelNumber++;
      if (game.levelNumber % 2 === 0) game.difficulty++;
      else game.zombielife++;

      if (win && game.levelNumber < LEVEL) {
        game.time2death += game.leveltime;
        game.bullet += ROWS * COLS * game.zombielife + 10;
        game.zombienumber = ROWS * COLS;
        setScene(levelScene(game));
      } else {
        results(game, win);
      }
    }

    function shoot(x, y) {
      if (startAt === null || ended) return;
      playSfx("shotgun");

      let hit = false;
      let headshotEvent = false;

      for (let i = 0; i < COLS; i++)
        for (let j = 0; j < ROWS; j++) {
          const z = grid[i][j];
          const zx = zombieX(i, j);
          const zy = zombieY(j);
          if (z.hidden === 0 && z.life > 0 && inRect(x, y, zx, zy, 80, 80)) {
            playSfx("shot" + z.life);
            z.life--;
            effects.push({ image: img.blood, x: x - 25, y: y - 25, until: performance.now() + 120 });
            if (z.life === 0) game.zombienumber--;
            game.score += 25;

            if (inRect(x, y, zx + 25, zy + 10, 30, 40)) {
              game.headshot++;
              headshotEvent = true;
            }
            currentStreak++;
            hit = true;
          }
        }

      if (!hit) currentStreak = 0;

      effects.push({ image: img.blast, x: x - 25, y: y - 25, until: performance.now() + 60 });
      game.bullet--;

      const streakEvent = hit && currentStreak > STREAK;
      if (streakEvent) {
        game.score += 3 * currentStreak;
        if (currentStreak > game.streak) game.streak = currentStreak;
      }
      if (headshotEvent) game.score += 25;

      if (streakEvent || headshotEvent) {
        banner = {
          headshot: headshotEvent,
          streak: streakEvent,
          count: currentStreak,
          until: performance.now() + 600,
        };
      }
    }

    return {
      hideCursor: true,
      update(t) {
        if (ended) return;
        if (startAt === null) startAt = t;
        if (t - startAt < 500) return;

        const n = now();
        if (n >= game.time2death || game.zombienumber === 0 || game.zombienumber * game.zombielife > game.bullet) {
          endLevel();
          return;
        }

        // Re-randomize zombies once every second
        const sec = Math.floor(n / 10);
        if (sec !== lastShuffle) {
          lastShuffle = sec;
          shuffle();
        }
      },
      render(t) {
        draw(img.background);

        if (startAt !== null && t - startAt >= 500) {
          for (let i = 0; i < COLS; i++)
            for (let j = 0; j < ROWS; j++) {
              const z = grid[i][j];
              if (z.hidden === 0 && z.life > 0) draw(img["zombie" + Math.min(3, z.life)], zombieX(i, j), zombieY(j));
            }
        }

        const n = Math.max(0, now());
        numberDisplay(200, 170, (game.time2death - n) / 10, 3);
        numberDisplay(400, 170, game.zombienumber, 2);
        numberDisplay(600, 170, game.bullet, 3);
        numberDisplay(700, 600, game.score, 6);

        const nowMs = performance.now();
        for (let k = effects.length - 1; k >= 0; k--) {
          if (effects[k].until < nowMs) effects.splice(k, 1);
          else draw(effects[k].image, effects[k].x, effects[k].y);
        }

        if (banner && banner.until > nowMs) {
          if (banner.streak) {
            draw(img.streak, 360, 550);
            numberDisplay(310, 565, banner.count, 2);
          }
          if (banner.headshot) draw(img.headshot, 50, 550);
        }

        draw(img.target, mouse.x - 25, mouse.y - 25);
      },
      onClick: shoot,
      onKey(k) {
        if (k === "Escape" && !ended && startAt !== null) pauseScene(game, this);
      },
    };
  }

  function pauseScene(game, level) {
    const pausedAt = Math.floor((performance.now() - game.timer) / 100);

    const resume = () => {
      game.timer = performance.now() - pausedAt * 100;
      setScene(level);
    };
    const quit = () => {
      // Jump the clock to the end so the level ends as a loss.
      game.timer = performance.now() - game.time2death * 100;
      setScene(level);
    };

    setScene({
      render() {
        dimmedBackground();
        draw(img.pause, 350, 200);
        draw(img.resume, 140, 350);
        draw(img.pauseExit, 540, 350);
      },
      onClick(x, y) {
        if (inRect(x, y, 140, 350, BUTTONWIDTH, BUTTONHEIGHT)) resume();
        else if (inRect(x, y, 540, 350, BUTTONWIDTH, BUTTONHEIGHT)) quit();
      },
      onKey(k) {
        if (k === "Escape" || k === " ") resume();
      },
    });
  }

  function results(game, win) {
    playMusic("energyOff", false);

    const records = loadRecords();
    const newHigh = game.score > records.highscore;
    const newStreak = game.streak > records.streak;
    const newHead = game.headshot > records.headshot;
    if (newHigh) records.highscore = game.score;
    if (newStreak) records.streak = game.streak;
    if (newHead) records.headshot = game.headshot;
    saveRecords(records);

    const right = SCREENWIDTH - BUTTONWIDTH - 50;

    setScene(
      waitScreen(
        () => {
          dimmedBackground();
          draw(win ? img.win : img.gameOver, 350, 100);
          draw(img.score, 350, 250);
          numberDisplay(350, 300, game.score, 6);
          draw(img.streak, 350, 350);
          numberDisplay(440, 400, game.streak, 2);
          draw(img.headshot, 350, 450);
          numberDisplay(440, 500, game.headshot, 2);

          if (newHigh) {
            draw(img.newHighscore, 50, 250);
            draw(img.newHighscore, right, 250);
          }
          if (newStreak) {
            draw(img.newStreak, 50, 350);
            draw(img.newStreak, right, 350);
          }
          if (newHead) {
            draw(img.mostHeadshot, 50, 450);
            draw(img.mostHeadshot, right, 450);
          }
        },
        mainMenu,
        "Press SPACE to return to menu"
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SCREENWIDTH, SCREENHEIGHT);
  ctx.fillStyle = "#fff";
  ctx.font = "24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Loading...", SCREENWIDTH / 2, SCREENHEIGHT / 2);

  loadAssets().then(() => {
    setScene(introScene());
    requestAnimationFrame(loop);
  });
})();
