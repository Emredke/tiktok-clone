import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Compass,
  Check,
  Lock,
  Sparkles,
  Camera,
  Bookmark,
  Flag,
  MessageSquare,
  Smartphone,
  Copy,
  Plus,
  X,
  RefreshCw,
} from "lucide-react";
import { api } from "./api";
export const clubRefresh = () => {
  window.dispatchEvent(new Event("velo-club"));
  window.dispatchEvent(new Event("velo-quests"));
};
export function useClub(user) {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [rev, setRev] = useState(0);
  const refresh = () => setRev((v) => v + 1);
  useEffect(() => setState(null), [user?.user_id]);
  useEffect(() => {
    let alive = true;
    setError("");
    api("/club")
      .then((d) => {
        if (alive) setState(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [user?.user_id, rev]);
  useEffect(() => {
    window.addEventListener("velo-club", refresh);
    return () => window.removeEventListener("velo-club", refresh);
  }, []);
  return { state, setState, error, refresh };
}
export function WorldArt({ small = false }) {
  return (
    <div
      className={`world-art ${small ? "world-small" : ""}`}
      aria-hidden="true"
    >
      <div className="world-orbit orbit-one" />
      <div className="world-orbit orbit-two" />
      <div className="world-orbit orbit-three" />
      <div className="world-globe">
        <div className="globe-lines" />
        <span>v.</span>
      </div>
      <span className="world-star star-one">✦</span>
      <span className="world-star star-two">✧</span>
      <span className="world-star star-three">✦</span>
      <span className="world-coordinate">35° OF WONDER / ∞ POSSIBILITIES</span>
      <div className="world-dot dot-one" />
      <div className="world-dot dot-two" />
    </div>
  );
}
export function FirstAdventure({ app, club, onFilm }) {
  const [busy, setBusy] = useState(false);
  const a = club?.adventure;
  if (!app.user || !a || a.claimed) return null;
  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
      clubRefresh();
    } catch (e) {
      app.notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (a.dismissed)
    return (
      <button
        className="adventure-resume"
        onClick={() =>
          act(() => api("/club/adventure", { dismissed: false }, "PUT"))
        }
      >
        <Compass size={17} /> Continue your first adventure{" "}
        <ArrowRight size={16} />
      </button>
    );
  const steps = [
    {
      name: "Choose your direction",
      detail: "Pick a topic that sparks something.",
      done: a.interests,
      action: () => app.navigate("/preferences"),
      icon: Compass,
    },
    {
      name: "Find your first treasure",
      detail: "Open a film, then tap Save video.",
      done: a.saved,
      action: onFilm,
      icon: Bookmark,
    },
    {
      name: "Make it official",
      detail: "Verify your email to collect your stamp.",
      done: a.verified,
      action: () => app.navigate(`/@${app.user.username}`),
      icon: Check,
    },
  ];
  return (
    <section className="first-adventure">
      <div className="adventure-title">
        <span className="eyebrow">YOUR FIRST ADVENTURE</span>
        <button
          aria-label="Minimize first adventure"
          disabled={busy}
          onClick={() =>
            act(() => api("/club/adventure", { dismissed: true }, "PUT"))
          }
        >
          <X size={18} />
        </button>
      </div>
      <div className="adventure-heading">
        <h2>Every journey starts somewhere.</h2>
        <span className="xp-pill">+25 XP · First light stamp</span>
      </div>
      <div className="adventure-steps">
        {steps.map((s, i) => (
          <button
            key={s.name}
            onClick={s.action}
            className={s.done ? "step-done" : ""}
          >
            <span className="step-number">
              {s.done ? <Check size={19} /> : String(i + 1).padStart(2, "0")}
            </span>
            <span>
              <strong>{s.name}</strong>
              <small>{s.detail}</small>
            </span>
            {!s.done && <ArrowUpRight size={18} />}
          </button>
        ))}
      </div>
      {a.completed && (
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            act(async () => {
              const r = await api("/club/adventure/claim", {});
              app.notify(
                r.awarded
                  ? "First light stamp earned. +25 XP is yours."
                  : "Your First light stamp is already collected.",
              );
            })
          }
        >
          {busy ? "Collecting…" : "Collect your first stamp"}
          <Sparkles size={18} />
        </button>
      )}
    </section>
  );
}
export function ChallengeTeaser({ app, challenge }) {
  if (!challenge) return null;
  return (
    <button
      className="challenge-teaser"
      onClick={() => app.navigate("/challenges")}
    >
      <span className="teaser-icon">
        <Flag size={23} />
      </span>
      <span>
        <span className="eyebrow">THE WEEKLY CREATIVE CHALLENGE</span>
        <strong>{challenge.title}</strong>
        <small>{challenge.subtitle}</small>
      </span>
      <span className="teaser-end">
        <span>+75 XP</span>
        <ArrowUpRight size={24} />
      </span>
    </button>
  );
}
export function PassportStudio({ app }) {
  const { state, error, refresh } = useClub(app.user);
  const [busy, setBusy] = useState("");
  if (!app.user)
    return (
      <GuestGate
        app={app}
        title="A passport to possibility."
        detail="Join the club to collect stamps and make your passport your own."
      />
    );
  const apply = async (r) => {
    setBusy(r.id);
    try {
      await api("/club/style", { kind: r.kind, id: r.id }, "PUT");
      clubRefresh();
      app.notify(`${r.name} is now yours.`);
    } catch (e) {
      app.notify(e.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="explore-page passport-studio">
      <PageHeading
        kicker="A LITTLE MORE YOU"
        title={
          <>
            Your world.
            <br />
            <em>Your signature.</em>
          </>
        }
        detail="Covers, frames, and titles. Earn them through curiosity. Keep them for good."
      />
      <LoadError error={error} refresh={refresh} />
      {!state && !error ? (
        <p role="status">Opening your collection…</p>
      ) : (
        state && (
          <>
            <div className="studio-showcase">
              <div className={`passport-object cover-${state.style.cover}`}>
                <div className="passport-object-head">
                  <span>VELO / CREATIVE PASSPORT</span>
                  <Compass size={24} />
                </div>
                <div className="passport-seal">
                  <Compass size={72} strokeWidth={0.8} />
                  <span>THE CURIOSITY CLUB</span>
                </div>
                <span className="passport-owner">{app.user.display_name}</span>
                <span className="passport-object-title">
                  {state.style.titleLabel} · Level {state.level}
                </span>
                <div className="passport-object-bottom">
                  <span>THE WORLD IS STILL FULL OF WONDER.</span>
                  <span>✦</span>
                </div>
              </div>
              <div className="studio-person">
                <span className="eyebrow">YOUR SIGNATURE</span>
                <div className={`signature-avatar frame-${state.style.frame}`}>
                  {app.user.avatar ? (
                    <img
                      src={`/api/avatars/${app.user.user_id}`}
                      alt="Your profile"
                    />
                  ) : (
                    app.user.display_name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <h2>{app.user.display_name}</h2>
                <span className="title-chip">{state.style.titleLabel}</span>
                <p>
                  Level {state.level} · {state.xp} lifetime XP
                </p>
                <button
                  className="text-link"
                  onClick={() => app.navigate("/quests")}
                >
                  Find your next adventure <ArrowRight size={17} />
                </button>
                <small>
                  Covers appear on your private passport. Your frame and title
                  appear on your profile.
                </small>
              </div>
            </div>
            {["cover", "frame", "title"].map((kind) => (
              <section className="reward-section" key={kind}>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">COLLECT A LITTLE CHARACTER</span>
                    <h2>
                      {kind === "cover"
                        ? "Covers with a story."
                        : kind === "frame"
                          ? "A frame of mind."
                          : "A name for your nature."}
                    </h2>
                  </div>
                  <span>
                    {
                      state.rewards.filter((r) => r.kind === kind && r.unlocked)
                        .length
                    }{" "}
                    unlocked
                  </span>
                </div>
                <div className={`reward-grid reward-${kind}`}>
                  {state.rewards
                    .filter((r) => r.kind === kind)
                    .map((r) => (
                      <article
                        className={`reward-card ${!r.unlocked ? "reward-locked" : ""} ${state.style[kind] === r.id ? "reward-selected" : ""}`}
                        key={r.id}
                      >
                        {kind === "cover" ? (
                          <div className={`reward-cover cover-${r.id}`}>
                            <Compass size={42} />
                            <span>velo</span>
                            <small>CREATIVE PASSPORT</small>
                          </div>
                        ) : kind === "frame" ? (
                          <div className="reward-frame-preview">
                            <span className={`signature-avatar frame-${r.id}`}>
                              {app.user.display_name.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                        ) : (
                          <div className="reward-title-preview">
                            <Sparkles size={24} />
                            <span>{r.name}</span>
                          </div>
                        )}
                        <div className="reward-copy">
                          <h3>{r.name}</h3>
                          <p>{r.detail}</p>
                          <button
                            className={
                              state.style[kind] === r.id
                                ? "reward-equipped"
                                : "secondary"
                            }
                            disabled={
                              !r.unlocked ||
                              !!busy ||
                              state.style[kind] === r.id
                            }
                            onClick={() => apply(r)}
                          >
                            {!r.unlocked ? (
                              <>
                                <Lock size={14} /> Unlock at level {r.level}
                              </>
                            ) : state.style[kind] === r.id ? (
                              <>
                                <Check size={15} /> In use
                              </>
                            ) : busy === r.id ? (
                              "Saving…"
                            ) : (
                              `Use ${r.name}`
                            )}
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </>
        )
      )}
    </section>
  );
}
export function PageHeading({ kicker, title, detail }) {
  return (
    <header className="club-page-heading">
      <span className="eyebrow">{kicker}</span>
      <h1>{title}</h1>
      <p>{detail}</p>
    </header>
  );
}
function GuestGate({ app, title, detail }) {
  return (
    <section className="explore-page">
      <PageHeading kicker="THE CURIOSITY CLUB" title={title} detail={detail} />
      <button className="primary" onClick={() => app.setAuth("signup")}>
        Join Velo <ArrowRight size={17} />
      </button>
    </section>
  );
}
function LoadError({ error, refresh }) {
  return (
    error && (
      <div className="explore-error" role="alert">
        <p>{error}</p>
        <button className="secondary" onClick={refresh}>
          <RefreshCw size={16} /> Try again
        </button>
      </div>
    )
  );
}
export function Challenges({ app }) {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [rev, setRev] = useState(0),
    [offset, setOffset] = useState(0);
  const refresh = () => {
    setOffset(0);
    setRev((v) => v + 1);
  };
  useEffect(() => {
    let alive = true;
    setError("");
    api(`/challenges?offset=${offset}`)
      .then((d) => {
        if (alive) {
          setState((old) =>
            offset
              ? { ...d, entries: [...(old?.entries || []), ...d.entries] }
              : d,
          );
          setSelected(d.entry?.video_id || d.candidates[0]?.id || "");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [app.user?.user_id, rev, offset]);
  const mutate = (fn) =>
    app.requireUser(async () => {
      if (busy) return;
      setBusy(true);
      try {
        await fn();
        refresh();
        clubRefresh();
      } finally {
        setBusy(false);
      }
    });
  const c = state?.challenge;
  return (
    <section className="explore-page challenge-page">
      <LoadError error={error} refresh={refresh} />
      {!state && !error && (
        <p role="status">Finding this week’s inspiration…</p>
      )}
      {c && (
        <>
          <div className={`challenge-hero challenge-${c.color}`}>
            <div>
              <span className="challenge-season">
                <Flag size={15} /> THIS WEEK’S CREATIVE CHALLENGE
              </span>
              <h1>{c.title}</h1>
              <p>{c.subtitle}</p>
              <div className="challenge-meta">
                <span>+{c.xp} XP · Trail maker stamp</span>
                <span>
                  Closes{" "}
                  {new Date(c.ends).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}{" "}
                  · 00:00 UTC
                </span>
              </div>
              <button
                className="light-button"
                onClick={() =>
                  app.user ? app.navigate("/create") : app.setAuth("signup")
                }
              >
                Make your contribution <Camera size={18} />
              </button>
            </div>
            <WorldArt small />
          </div>
          <div className="challenge-brief">
            <div>
              <span className="eyebrow">{c.cue}</span>
              <h2>
                One prompt.
                <br />
                <em>A thousand perspectives.</em>
              </h2>
            </div>
            <div>
              <p>{c.prompt}</p>
              <div className="challenge-tips">
                {c.tips.map((t) => (
                  <span key={t}>
                    <Check size={15} />
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <section className="challenge-submit">
            <div>
              <span className="eyebrow">YOUR CONTRIBUTION</span>
              <h2>
                {state.entry
                  ? "Your perspective is in."
                  : "Make a little room for your idea."}
              </h2>
              <p>
                One original public film per person, published this week.
                Submitting places it in the shared showcase. You can withdraw it
                at any time.
              </p>
            </div>
            <div>
              {!app.user ? (
                <button
                  className="primary"
                  onClick={() => app.setAuth("signup")}
                >
                  Join the challenge <ArrowRight size={18} />
                </button>
              ) : state.entry ? (
                <>
                  <button
                    className="secondary"
                    onClick={() => app.navigate(`/v/${state.entry.video_id}`)}
                  >
                    View your contribution <ArrowUpRight size={17} />
                  </button>
                  {!state.claimed ? (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        mutate(async () => {
                          const r = await api("/challenges/claim", {});
                          app.notify(
                            r.awarded
                              ? "Trail maker stamp earned. +75 XP added."
                              : "Reward already collected.",
                          );
                        })
                      }
                    >
                      Collect 75 XP <Sparkles size={18} />
                    </button>
                  ) : (
                    <span className="collected-label">
                      <Check size={16} /> Reward collected
                    </span>
                  )}
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() =>
                      mutate(() => api("/challenges/entry", {}, "DELETE"))
                    }
                  >
                    Withdraw contribution
                  </button>
                </>
              ) : state.candidates.length ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutate(async () => {
                      await api("/challenges/entry", { video_id: selected });
                      app.notify("Your film is in the showcase.");
                    });
                  }}
                >
                  <label htmlFor="challenge-film">Choose your film</label>
                  <select
                    id="challenge-film"
                    required
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {state.candidates.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.caption.split("#")[0]}
                      </option>
                    ))}
                  </select>
                  <button className="primary" disabled={busy}>
                    {busy ? "Submitting…" : "Add to the showcase"}
                    <ArrowUpRight size={17} />
                  </button>
                </form>
              ) : (
                <>
                  <p>
                    Your eligible films will appear here after you publish.
                    Imported footage and remixes don’t qualify.
                  </p>
                  <button
                    className="primary"
                    onClick={() => app.navigate("/create")}
                  >
                    Create an original film <Camera size={17} />
                  </button>
                </>
              )}
            </div>
          </section>
          <div className="section-heading">
            <div>
              <span className="eyebrow">MADE BY THE CLUB</span>
              <h2>The shared showcase.</h2>
            </div>
            <span>
              {state.total} {state.total === 1 ? "perspective" : "perspectives"}
            </span>
          </div>
          {state.entries.length ? (
            <div className="showcase-grid">
              {state.entries.map((v) => (
                <button
                  className="showcase-film"
                  key={v.id}
                  onClick={() => app.navigate(`/v/${v.id}`)}
                >
                  <img src={v.thumbnail_url} alt="" loading="lazy" />
                  <div>
                    <span>@{v.username}</span>
                    <h3>{v.caption.split("#")[0]}</h3>
                    <ArrowUpRight size={20} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="showcase-empty">
              <Sparkles size={30} />
              <h3>The first perspective could be yours.</h3>
              <p>This showcase fills with real contributions from the club.</p>
            </div>
          )}
          {state.hasMore && (
            <button
              className="secondary shelf-more"
              onClick={() => setOffset((v) => v + 12)}
            >
              More perspectives <ArrowRight size={17} />
            </button>
          )}
          <p className="small-note">
            Entries remain subject to visibility, blocking, and moderation.
            Earned stamps stay yours. New prompt every Monday at 00:00 UTC.
          </p>
        </>
      )}
    </section>
  );
}
export function BetaInvite({ app }) {
  const { state: club } = useClub(app.user);
  const token = new URLSearchParams(location.search).get("invite"),
    [busy, setBusy] = useState(false);
  const join = () =>
    app.requireUser(async () => {
      setBusy(true);
      try {
        await api("/beta/join", { token });
        clubRefresh();
        app.navigate("/beta");
        app.notify("Welcome to the founding circle.");
      } finally {
        setBusy(false);
      }
    });
  return (
    <section className="explore-page invite-page">
      <div className="invite-card">
        <WorldArt small />
        <span className="eyebrow">A LITTLE INVITATION TO SOMETHING NEW</span>
        <h1>
          You’re in
          <br />
          <em>good company.</em>
        </h1>
        <p>
          A small circle helping shape Velo. Explore, make something, and tell
          us what you think.
        </p>
        {!token ? (
          <p role="alert">
            This invitation is missing its code. Ask your host for the complete
            link.
          </p>
        ) : app.user ? (
          <button
            className="primary"
            disabled={busy || !club}
            onClick={() => (club.beta ? app.navigate("/beta") : join())}
          >
            {busy
              ? "Joining…"
              : club?.beta
                ? "Enter the founding circle"
                : "Accept your invitation"}
            <ArrowRight size={18} />
          </button>
        ) : (
          <>
            <button className="primary" onClick={() => app.setAuth("signup")}>
              Create your account <ArrowRight size={18} />
            </button>
            <button className="text-link" onClick={() => app.setAuth("login")}>
              Already a member? Sign in
            </button>
          </>
        )}
        <small>
          One person per invitation. Your feedback goes privately to the club
          host.
        </small>
      </div>
    </section>
  );
}
export function BetaLab({ app }) {
  const [state, setState] = useState(null),
    [manage, setManage] = useState(null),
    [error, setError] = useState(""),
    [rev, setRev] = useState(0),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(""),
    [notice, setNotice] = useState("");
  const refresh = () => setRev((v) => v + 1);
  useEffect(() => {
    let alive = true;
    setState(null);
    setManage(null);
    setError("");
    if (!app.user) return;
    api("/beta")
      .then((d) => {
        if (alive) setState(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    if (app.user.role === "admin")
      api("/beta/manage")
        .then((d) => {
          if (alive) setManage(d);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [app.user?.user_id, rev]);
  const submit = async (fn, message) => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await fn();
      setNotice(message);
      refresh();
    } catch (e) {
      app.notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!app.user)
    return (
      <GuestGate
        app={app}
        title="The founding circle."
        detail="Sign in with your invited account to help shape the club."
      />
    );
  return (
    <section className="explore-page beta-page">
      <PageHeading
        kicker="SMALL CIRCLE. BIG POSSIBILITIES."
        title={
          <>
            Build a better
            <br />
            <em>kind of social.</em>
          </>
        }
        detail="A private space for your feedback, ideas, and real-device discoveries."
      />
      <LoadError error={error} refresh={refresh} />
      {notice && (
        <p className="inline-success" role="status">
          <Check size={17} />
          {notice}
        </p>
      )}
      {!state && !error && <p role="status">Opening the founding circle…</p>}
      {state && (
        <>
          <div className="beta-grid">
            <section className="beta-panel">
              <MessageSquare size={25} />
              <h2>Leave a field note.</h2>
              <p>
                What felt great? What got in your way? A small detail can make a
                big difference.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    b = Object.fromEntries(new FormData(form));
                  submit(async () => {
                    await api("/beta/feedback", {
                      ...b,
                      page: location.pathname,
                    });
                    form.reset();
                  }, "Your note is saved. Thank you for helping shape Velo.");
                }}
              >
                <label htmlFor="feedback-kind">Type of note</label>
                <select name="kind" id="feedback-kind">
                  <option value="bug">Something isn’t working</option>
                  <option value="idea">An idea for the club</option>
                  <option value="delight">Something I loved</option>
                </select>
                <label htmlFor="feedback-body">Your field note</label>
                <textarea
                  name="body"
                  id="feedback-body"
                  minLength={10}
                  maxLength={2000}
                  rows={5}
                  required
                  placeholder="Tell us what happened, and what you expected…"
                />
                <small>
                  Private to you and the club host. Avoid passwords or personal
                  details.
                </small>
                <button className="primary" disabled={busy}>
                  Send your note <ArrowUpRight size={17} />
                </button>
              </form>
            </section>
            <section className="beta-panel device-panel">
              <Smartphone size={25} />
              <h2>Try it in the real world.</h2>
              <p>
                On your iPhone 16 Pro, open Velo in Safari. Test each step, then
                record what actually happened.
              </p>
              <ol className="device-checklist">
                <li>Play a film, pause, scrub, rotate, and use sound.</li>
                <li>
                  Allow the camera, record 5 seconds, and check the preview.
                </li>
                <li>
                  Upload that film, publish, then play it from your profile.
                </li>
                <li>Try larger text and VoiceOver; check labels and focus.</li>
              </ol>
              <p className="device-caveat">
                Use the phone’s reachable HTTPS app address. Automated mobile
                checks do not mark these device tests as passed.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = e.currentTarget,
                    b = Object.fromEntries(new FormData(f)),
                    results = {};
                  for (const k of [
                    "playback",
                    "camera",
                    "upload",
                    "accessibility",
                  ]) {
                    results[k] = b[k];
                    delete b[k];
                  }
                  submit(
                    () => api("/beta/devices", { ...b, results }),
                    "Your device check is saved.",
                  );
                }}
              >
                <div className="form-pair">
                  <label>
                    Phone model
                    <input
                      name="model"
                      defaultValue="iPhone 16 Pro"
                      minLength={2}
                      maxLength={80}
                      required
                    />
                  </label>
                  <label>
                    Platform
                    <select name="platform">
                      <option value="ios">iPhone / iOS</option>
                      <option value="android">Android</option>
                    </select>
                  </label>
                </div>
                <label>
                  Browser and version
                  <input
                    name="browser"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Safari, iOS version"
                  />
                </label>
                <div className="device-results">
                  {["playback", "camera", "upload", "accessibility"].map(
                    (k) => (
                      <label key={k}>
                        {k[0].toUpperCase() + k.slice(1)}
                        <select name={k} defaultValue="untested">
                          <option value="untested">Not tested</option>
                          <option value="pass">Passed on this phone</option>
                          <option value="fail">Needs attention</option>
                        </select>
                      </label>
                    ),
                  )}
                </div>
                <label>
                  What did you notice?
                  <textarea name="notes" rows={2} maxLength={1000} />
                </label>
                <button className="secondary" disabled={busy}>
                  Save device check <Check size={17} />
                </button>
              </form>
            </section>
          </div>
          <section className="beta-history">
            <span className="eyebrow">YOUR CONVERSATION WITH THE CLUB</span>
            <h2>Notes worth keeping.</h2>
            {state.feedback.length ? (
              state.feedback.map((f) => (
                <article className="feedback-note" key={f.id}>
                  <span className={`note-status status-${f.status}`}>
                    {f.status}
                  </span>
                  <span className="eyebrow">{f.kind.toUpperCase()}</span>
                  <p>{f.body}</p>
                </article>
              ))
            ) : (
              <p>
                Your notes will appear here, along with their review status.
              </p>
            )}
            {state.devices.length > 0 && (
              <div className="recorded-devices">
                <h3>Your recorded device checks</h3>
                {state.devices.map((d) => (
                  <article key={d.id}>
                    <strong>
                      {d.model} · {d.browser}
                    </strong>
                    <div>
                      {Object.entries(d.results).map(([k, v]) => (
                        <span key={k} className={`result-${v}`}>
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                    {d.notes && <p>{d.notes}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {manage && (
        <section className="beta-admin">
          <div className="section-heading">
            <div>
              <span className="eyebrow">HOST’S DESK</span>
              <h2>A circle of ten.</h2>
            </div>
            <span>Private beta</span>
          </div>
          <p>
            Create a single-use invitation and share its link yourself. Links
            expire after 14 days. No invitation emails are sent.
          </p>
          <form
            className="invite-form"
            onSubmit={(e) => {
              e.preventDefault();
              const b = Object.fromEntries(new FormData(e.currentTarget));
              submit(async () => {
                const r = await api("/beta/invites", b);
                setLink(`${location.origin}/invite?invite=${r.token}`);
              }, "Invitation prepared. Copy the link below; it is only shown now.");
            }}
          >
            <label htmlFor="invite-label">Invitation label</label>
            <input
              name="label"
              id="invite-label"
              placeholder="Tester 01"
              required
              maxLength={50}
            />
            <button className="primary" disabled={busy}>
              <Plus size={17} /> Create invite
            </button>
          </form>
          {link && (
            <div className="invite-link">
              <input readOnly aria-label="New beta invite link" value={link} />
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    app.notify("Invite link copied.");
                  } catch {
                    app.notify("Select and copy the invite link.");
                  }
                }}
              >
                <Copy size={17} /> Copy link
              </button>
            </div>
          )}
          <div className="invite-list">
            {manage.invites.map((i) => (
              <div key={i.id}>
                <strong>{i.label}</strong>
                <span>
                  {i.used_at
                    ? `Joined${i.username ? ` · @${i.username}` : ""}`
                    : i.revoked
                      ? "Revoked"
                      : i.expires_at < Date.now()
                        ? "Expired"
                        : "Reserved"}
                </span>
                {!i.used_at && !i.revoked && (
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() =>
                      submit(
                        () => api(`/beta/invites/${i.id}`, {}, "DELETE"),
                        "Invitation revoked.",
                      )
                    }
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
          <h3>All beta feedback</h3>
          {manage.feedback.length ? (
            manage.feedback.map((f) => (
              <article className="feedback-note" key={f.id}>
                <span className="eyebrow">
                  @{f.username} · {f.kind}
                </span>
                <p>{f.body}</p>
                <label>
                  Review status
                  <select
                    aria-label={`Review note ${f.id}`}
                    value={f.status}
                    disabled={busy}
                    onChange={(e) =>
                      submit(
                        () =>
                          api(
                            `/beta/feedback/${f.id}`,
                            { status: e.target.value },
                            "PUT",
                          ),
                        "Review status saved.",
                      )
                    }
                  >
                    <option value="new">New</option>
                    <option value="reviewing">Reviewing</option>
                    <option value="done">Done</option>
                  </select>
                </label>
              </article>
            ))
          ) : (
            <p>Real tester feedback will appear here.</p>
          )}
          <h3>Real-device results</h3>
          {manage.devices.length ? (
            manage.devices.map((d) => (
              <article className="feedback-note" key={d.id}>
                <strong>
                  {d.model} · {d.browser} · @{d.username}
                </strong>
                <div className="recorded-results">
                  {Object.entries(d.results).map(([k, v]) => (
                    <span key={k} className={`result-${v}`}>
                      {k}: {v}
                    </span>
                  ))}
                </div>
                {d.notes && <p>{d.notes}</p>}
              </article>
            ))
          ) : (
            <p>No hands-on device results recorded yet.</p>
          )}
        </section>
      )}
    </section>
  );
}
