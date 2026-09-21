// Three-way merge suite. Run:
//   node --experimental-strip-types --no-warnings tests/merge.test.mjs
import { deepEqual, mergeById, mergeCard, mergeProfileData } from "../src/lib/merge.ts";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log("FAIL", n, JSON.stringify(x)); } };
const sec = (id, content, extra = {}) => ({ id, title: id, kind: "text", content, ...extra });
const card = (o = {}) => ({ id: "c", title: "T", status: "ideas", sections: [sec("s1", "a"), sec("s2", "b")], createdAt: "1", updatedAt: "1", ...o });

ok("key order ignored", deepEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }));
ok("undefined == missing", deepEqual({ a: 1, b: undefined }, { a: 1 }));
ok("null == undefined", deepEqual({ a: null }, {}));
ok("array order matters", !deepEqual([1, 2], [2, 1]));
ok("diff detected", !deepEqual({ a: { b: 1 } }, { a: { b: 2 } }));

const base = card();
// different sections
let m = mergeCard(base, card({ sections: [sec("s1", "MINE"), sec("s2", "b")], updatedAt: "2" }), card({ sections: [sec("s1", "a"), sec("s2", "THEIRS")], updatedAt: "3" }));
ok("both sections survive", m.sections[0].content === "MINE" && m.sections[1].content === "THEIRS", m);
ok("updatedAt = newest", m.updatedAt === "3");
// same section → ours
m = mergeCard(base, card({ sections: [sec("s1", "MINE"), sec("s2", "b")] }), card({ sections: [sec("s1", "THEIRS"), sec("s2", "b")] }));
ok("same section keeps ours", m.sections[0].content === "MINE");
// they move status, we edit title
m = mergeCard(base, card({ title: "Mine" }), card({ status: "filming" }));
ok("status + title both land", m.title === "Mine" && m.status === "filming", m);
// they set a new field, we didn't touch it
m = mergeCard(base, card({ title: "Mine" }), card({ postingDate: "2026-10-01" }));
ok("their new field lands", m.postingDate === "2026-10-01");
// they cleared a field we didn't touch
m = mergeCard(card({ hook: "h" }), card({ hook: "h", title: "Mine" }), card({}));
ok("their clear lands", m.hook === undefined && m.title === "Mine", m);
// they add a section, we add a different one
m = mergeCard(base, card({ sections: [...base.sections, sec("mine", "x")] }), card({ sections: [...base.sections, sec("theirs", "y")] }));
ok("both added sections survive", m.sections.length === 4, m.sections.map((s) => s.id));
// they delete a section we didn't touch
m = mergeCard(base, card({ title: "Mine" }), card({ sections: [sec("s1", "a")] }));
ok("their delete lands", m.sections.length === 1);
// they delete a section we edited → ours survives
m = mergeCard(base, card({ sections: [sec("s1", "a"), sec("s2", "EDITED")] }), card({ sections: [sec("s1", "a")] }));
ok("our edit beats their delete", m.sections.length === 2 && m.sections[1].content === "EDITED", m.sections);
// no base (first contact): ours wins on conflicts, theirs fills gaps
m = mergeCard(undefined, card({ title: "Mine" }), card({ title: "Theirs", hook: "h" }));
ok("no base: ours wins, theirs fills", m.title === "Mine" && m.hook === "h");
// jsonb round trip of `theirs` (key order scrambled) is not a false conflict
const scrambled = JSON.parse(JSON.stringify({ updatedAt: "1", sections: [{ kind: "text", content: "a", title: "s1", id: "s1" }, { content: "THEIRS", id: "s2", title: "s2", kind: "text" }], status: "ideas", createdAt: "1", title: "T", id: "c" }));
m = mergeCard(base, card({ title: "Mine" }), scrambled);
ok("scrambled keys merge cleanly", m.title === "Mine" && m.sections[1].content === "THEIRS", m);

// review notes: two people commenting on the same cut at once
const cm = (id, text, extra = {}) => ({ id, time: 5, text, author: "a@x.com", createdAt: id, ...extra });
const ver = (id, comments) => ({ id, url: "u", provider: "youtube", addedAt: "1", addedBy: "a", comments });
const rbase = card({ review: { versions: [ver("v1", [cm("c1", "first")])] } });
m = mergeCard(rbase,
  card({ review: { versions: [ver("v1", [cm("c1", "first"), cm("c2", "MINE")])] } }),
  card({ review: { versions: [ver("v1", [cm("c1", "first", { resolved: true }), cm("c3", "THEIRS")])] } }));
ok("both people's notes land", m.review.versions[0].comments.length === 3, m.review);
ok("their resolve lands", m.review.versions[0].comments.find((c) => c.id === "c1").resolved === true, m.review);
m = mergeCard(rbase,
  card({ review: { versions: [ver("v1", [cm("c1", "first"), cm("c2", "note on v1")])] } }),
  card({ review: { versions: [ver("v1", [cm("c1", "first")]), ver("v2", [])] } }));
ok("their new cut + our note on the old one", m.review.versions.length === 2 && m.review.versions[0].comments.length === 2, m.review);
m = mergeCard(card(), card({ review: { versions: [ver("v1", [])] } }), card({ title: "Theirs" }));
ok("first cut added while they edit elsewhere", m.review.versions.length === 1 && m.title === "Theirs", m);

// lists
const I = (id, t = "") => ({ id, t });
let l = mergeById([I("1"), I("2")], [I("new-mine"), I("1"), I("2")], [I("new-theirs"), I("1"), I("2")], (x) => x.id);
ok("both inspo adds kept", l.length === 4 && l.some((x) => x.id === "new-mine") && l.some((x) => x.id === "new-theirs"), l);
l = mergeById([I("1"), I("2")], [I("1"), I("2"), I("3")], [I("2")], (x) => x.id);
ok("their remove + our add", l.map((x) => x.id).join() === "2,3", l);
l = mergeById([I("1"), I("2"), I("3")], [I("3"), I("1"), I("2")], [I("1"), I("2"), I("3"), I("4")], (x) => x.id);
ok("our reorder kept, their add follows its neighbour", l.map((x) => x.id).join() === "3,4,1,2", l);

l = mergeById([I("1"), I("2")], [I("mine"), I("1"), I("2")], [I("theirs"), I("1"), I("2")], (x) => x.id);
ok("both top-adds stay on top", l.map((x) => x.id).join() === "mine,theirs,1,2" || l.map((x) => x.id).join() === "theirs,mine,1,2", l);
l = mergeById([I("1"), I("2")], [I("1"), I("2"), I("mine")], [I("1"), I("theirs"), I("2")], (x) => x.id);
ok("end-add stays at end", l.map((x) => x.id).join() === "1,theirs,2,mine", l);
const p = mergeProfileData(
  { brandName: "B", inspo: [I("1")], topics: ["a"] },
  { brandName: "B", inspo: [I("mine"), I("1")], topics: ["a"] },
  { brandName: "B2", inspo: [I("theirs"), I("1")], topics: ["a", "b"] }
);
ok("profile merge", p.brandName === "B2" && p.inspo.length === 3 && p.topics.length === 2, p);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
