import csv
import json
import math
import sys
from collections import defaultdict

S = sys.argv[1]


def v(a, b):
    return [a[i] - b[i] for i in range(3)]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def norm(a):
    return math.sqrt(dot(a, a))


def quat_rot(q, v):
    w, x, y, z = q
    # rotate vector by quaternion (w,x,y,z)
    t = [
        2 * (y * v[2] - z * v[1]),
        2 * (z * v[0] - x * v[2]),
        2 * (x * v[1] - y * v[0]),
    ]
    return [
        v[0] + w * t[0] + (y * t[2] - z * t[1]),
        v[1] + w * t[1] + (z * t[0] - x * t[2]),
        v[2] + w * t[2] + (x * t[1] - y * t[0]),
    ]


def mocap_stats(path):
    with open(path) as fh:
        d = json.load(fh)
    fr = d["frames"]
    fps = d["fps"]
    n = len(fr)
    P = lambda i, b: fr[i][b]["pos"]
    leg = norm(v(P(0, "thigh_l"), P(0, "calf_l"))) + norm(
        v(P(0, "calf_l"), P(0, "foot_l"))
    )
    # pelvis forward: blender -Y forward in rest; use pelvis quat rotating rest forward. Instead use thigh line for right.
    up = [0, 0, 1]
    ground = min(P(i, f)[2] for i in range(n) for f in ("foot_l", "foot_r"))
    bground = min(P(i, f)[2] for i in range(n) for f in ("ball_l", "ball_r"))

    # travel direction at each frame from pelvis velocity (smoothed)
    def fwd(i):
        a = P(max(i - 3, 0), "pelvis")
        b = P(min(i + 3, n - 1), "pelvis")
        f = v(b, a)
        f[2] = 0
        l = norm(f)
        return [f[0] / l, f[1] / l, 0] if l > 1e-6 else [0, -1, 0]

    # pelvis facing from thigh line (right = thigh_r - thigh_l)
    def facing(i):
        r = v(P(i, "thigh_r"), P(i, "thigh_l"))
        r[2] = 0
        l = norm(r)
        r = [r[0] / l, r[1] / l, 0]
        return [
            -(r[1] * up[2] - r[2] * up[1]),
            -(r[2] * up[0] - r[0] * up[2]),
            0,
        ]  # up x right = forward? compute fwd = up × right ... sign check below

    # sign check: on Walk_Loop_F travel is -Y; ensure facing agrees with travel on average
    sgn = 1
    acc = sum(dot(facing(i), fwd(i)) for i in range(n))
    if acc < 0:
        sgn = -1

    def face(i):
        f = facing(i)
        return [sgn * f[0], sgn * f[1], 0]

    yaw = [math.atan2(-face(i)[0], -face(i)[1]) for i in range(n)]

    def wrap(a):
        return (a + math.pi) % (2 * math.pi) - math.pi

    turn = [
        wrap(yaw[min(i + 1, n - 1)] - yaw[max(i - 1, 0)]) * fps / 2 for i in range(n)
    ]
    out = {
        "leg": leg,
        "turn_mean": sum(abs(t) for t in turn) / n,
        "speed": 0,
        "feet": {},
    }
    sp = norm(v(P(n - 1, "pelvis"), P(0, "pelvis"))) / (n / fps)
    out["speed"] = sp
    still = max(0.25, 0.4 * sp)
    for side in "lr":
        f = f"foot_{side}"
        b = f"ball_{side}"
        contact = []
        for i in range(n):
            vel_f = norm(v(P((i + 1) % n, f), P(i, f))) * fps
            vel_b = norm(v(P((i + 1) % n, b), P(i, b))) * fps
            contact.append(
                (P(i, f)[2] - ground < 0.1 and vel_f < still)
                or (P(i, b)[2] - bground < 0.1 and vel_b < still)
            )
        fwds = []
        sides = []
        twists = []
        knees = []
        for i in range(n):
            fc = face(i)
            rt = [
                -fc[1],
                fc[0],
                0,
            ]  # right = rotate forward -90 about up (check: fwd -Y -> right = (1,0)? -(-1)=1 -> (1,0) hmm gives (1,0)=+X; in blender right of -Y forward is -X
            rt = [fc[1], -fc[0], 0]
            rel = v(P(i, f), P(i, "pelvis"))
            fwds.append(dot(rel, fc) / leg)
            sides.append(dot(rel, rt) / leg)
            ft = v(P(i, b), P(i, f))
            ft[2] = 0
            l = norm(ft)
            if l > 1e-6:
                ft = [ft[0] / l, ft[1] / l, 0]
                twists.append(math.degrees(math.atan2(dot(ft, rt), dot(ft, fc))))
            else:
                twists.append(0)
            a = v(P(i, f"thigh_{side}"), P(i, f"calf_{side}"))
            c = v(P(i, f), P(i, f"calf_{side}"))
            knees.append(
                180
                - math.degrees(
                    math.acos(max(-1, min(1, dot(a, c) / (norm(a) * norm(c)))))
                )
            )
        planted_tw = [twists[i] for i in range(n) if contact[i]]
        sum(1 for i in range(n) if not contact[i] and not (contact[i]))
        out["feet"][side] = {
            "duty": sum(contact) / n,
            "fwd": (pct(fwds, 0.02), pct(fwds, 0.98)),
            "side": (pct(sides, 0.02), pct(sides, 0.98)),
            "twist_planted": (min(planted_tw), max(planted_tw)) if planted_tw else None,
            "twist_abs_mean": sum(abs(t) for t in twists) / n,
            "knee": (pct(knees, 0.02), pct(knees, 0.98)),
        }
        out["feet"][side]["contact"] = contact
    cl = out["feet"]["l"]["contact"]
    cr = out["feet"]["r"]["contact"]
    out["flight"] = sum(1 for i in range(n) if not cl[i] and not cr[i]) / n
    out["double"] = sum(1 for i in range(n) if cl[i] and cr[i]) / n
    for s in "lr":
        del out["feet"][s]["contact"]
    return out


def game_stats(path):
    with open(path) as fh:
        rows = list(csv.DictReader(fh))
    ents = defaultdict(list)
    for r in rows:
        ents[r["entity"]].append(r)
    ent = max(
        ents, key=lambda e: sum(int(r["l_plant"]) + int(r["r_plant"]) for r in ents[e])
    )
    rs = [r for r in ents[ent] if float(r["weight"]) > 0.99 and float(r["speed"]) > 0.5]
    n = len(rs)
    out = {
        "frames": n,
        "speed": sum(float(r["speed"]) for r in rs) / n,
        "turn_mean": sum(abs(float(r["turn"])) for r in rs) / n,
        "feet": {},
    }
    for s in "lr":

        def f(k, s=s):
            return [float(r[f"{s}_{k}"]) for r in rs]

        pl = [int(r[f"{s}_plant"]) for r in rs]
        tw = f("twist")
        knees = f("knee")
        planted_tw = [tw[i] for i in range(n) if pl[i]]
        out["feet"][s] = {
            "duty": sum(pl) / n,
            "fwd": (pct(f("fwd"), 0.02), pct(f("fwd"), 0.98)),
            "side": (pct(f("side"), 0.02), pct(f("side"), 0.98)),
            "twist_planted": (min(planted_tw), max(planted_tw)) if planted_tw else None,
            "twist_abs_mean": sum(abs(t) for t in tw) / n,
            "knee": (pct(knees, 0.02), pct(knees, 0.98)),
        }
    pl_l = [int(r["l_plant"]) for r in rs]
    pl_r = [int(r["r_plant"]) for r in rs]
    out["flight"] = sum(1 for i in range(n) if not pl_l[i] and not pl_r[i]) / n
    out["double"] = sum(1 for i in range(n) if pl_l[i] and pl_r[i]) / n
    return out


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))]


def show(name, o):
    print(
        f"== {name}: speed {o['speed']:.2f} m/s turn {math.degrees(o['turn_mean']):.0f} deg/s flight {o['flight']:.2f} double {o['double']:.2f}"
    )
    for s in "lr":
        f = o["feet"][s]
        tp = (
            f"{f['twist_planted'][0]:+.0f}..{f['twist_planted'][1]:+.0f}"
            if f["twist_planted"]
            else "-"
        )
        print(
            f"   {s}: duty {f['duty']:.2f} fwd {f['fwd'][0]:+.2f}..{f['fwd'][1]:+.2f} side {f['side'][0]:+.2f}..{f['side'][1]:+.2f} twist(planted) {tp} |twist| {f['twist_abs_mean']:.0f} knee {f['knee'][0]:.0f}..{f['knee'][1]:.0f}"
        )


for c in [
    "M_Neutral_Walk_Loop_F",
    "M_Neutral_Walk_Arc_F_Tight_L",
    "M_Neutral_Walk_Arc_F_Small_L",
    "M_Neutral_Walk_Box_F_LL_Lfoot",
]:
    show("mocap " + c, mocap_stats(f"{S}/mocap/{c}.json"))
for g in ["walk", "turn"]:
    show("game " + g, game_stats(f"{S}/trace_{g}.csv"))
