import { Crown } from "lucide-react";
import { BrandValues } from "@/components/login/BrandValues";

const slabs = [
  {
    className: "left-[4%] top-[34%] h-[35%] w-[14%]",
    face: "bg-gradient-to-br from-[#0d0d0c] via-[#2b2926] to-[#060606]",
    depth: "translateZ(0) rotateY(-13deg)",
    opacity: "opacity-70"
  },
  {
    className: "left-[17%] top-[24%] h-[54%] w-[17%]",
    face: "bg-gradient-to-br from-[#efe8db] via-[#c9bda8] to-[#8d7250]",
    depth: "translateZ(20px) rotateY(-8deg)",
    opacity: "opacity-95"
  },
  {
    className: "left-[36%] top-[11%] h-[68%] w-[28%]",
    face: "bg-gradient-to-br from-[#24211d] via-[#040404] to-[#332416]",
    depth: "translateZ(56px) rotateY(-4deg)",
    opacity: "opacity-100",
    hero: true
  },
  {
    className: "left-[63%] top-[15%] h-[63%] w-[8.5%]",
    face: "bg-gradient-to-br from-[#050505] via-[#201812] to-black",
    depth: "translateZ(34px) rotateY(7deg)",
    opacity: "opacity-92"
  },
  {
    className: "right-[5%] top-[27%] h-[49%] w-[25%]",
    face: "bg-gradient-to-br from-[#c7a982] via-[#6f5a49] to-[#e7d0ad]",
    depth: "translateZ(18px) rotateY(10deg)",
    opacity: "opacity-95"
  }
];

export function StoneShowcase() {
  return (
    <section className="relative hidden min-h-screen overflow-hidden border-l border-gold/18 bg-[#050606] lg:block">
      <div className="login-marble-bg absolute inset-0 opacity-95" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_57%_18%,rgba(239,227,194,0.12),transparent_30rem),linear-gradient(90deg,rgba(0,0,0,0.44),transparent_25%,rgba(0,0,0,0.08))]" />

      <div className="absolute inset-x-0 top-0 h-full">
        <span className="absolute left-[17%] top-0 h-full w-px bg-gradient-to-b from-transparent via-gold/42 to-transparent" />
        <span className="absolute left-[52%] top-0 h-full w-[3px] bg-gradient-to-b from-transparent via-[#f6d58b] to-transparent shadow-[0_0_34px_rgba(196,154,69,0.72)]" />
        <span className="absolute right-[13%] top-0 h-full w-px bg-gradient-to-b from-transparent via-gold/38 to-transparent" />
        <span className="absolute right-[9%] top-0 h-1/2 w-[2px] bg-gradient-to-b from-gold/70 to-transparent shadow-[0_0_22px_rgba(196,154,69,0.55)]" />
      </div>

      <div className="showroom-floor absolute inset-x-0 bottom-[10.5%] h-[36%]" />
      <div className="absolute inset-x-[-10%] bottom-[8%] h-[18%] bg-gradient-to-b from-white/10 via-black/20 to-black/70 blur-sm" />

      <div className="absolute inset-0 mx-auto max-w-[980px]" style={{ perspective: "1400px" }}>
        {slabs.map((slab, index) => (
          <article
            key={slab.className}
            className={`stone-veins slab-face absolute rounded-[2px] border border-white/12 shadow-[0_34px_80px_rgba(0,0,0,0.64)] ${slab.className} ${slab.face} ${slab.opacity}`}
            style={{ transform: slab.depth, zIndex: 10 + index }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(255,255,255,0.16),transparent_18%,transparent_72%,rgba(0,0,0,0.34))]" />
            <div className="absolute inset-y-0 right-0 w-2 bg-gradient-to-b from-gold/10 via-gold/68 to-gold/20 shadow-[0_0_24px_rgba(196,154,69,0.55)]" />
            <div className="absolute inset-x-5 bottom-0 h-2 bg-gold/62 shadow-[0_0_24px_rgba(196,154,69,0.68)]" />
            <div className="absolute -bottom-[20%] left-5 right-5 h-[18%] bg-gold/20 blur-xl" />
            {slab.hero ? <HeroSlabBrand /> : null}
          </article>
        ))}
      </div>

      <BrandValues />
    </section>
  );
}

function HeroSlabBrand() {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center text-center">
      <div className="translate-y-1">
        <div className="mx-auto grid h-24 w-20 place-items-center">
          <div className="crest-shield relative grid h-20 w-16 place-items-center border border-gold/70 bg-black/24 text-gold shadow-[0_0_32px_rgba(196,154,69,0.18)]">
            <Crown className="absolute -top-4 h-6 w-6 text-gold" strokeWidth={1.4} />
            <span className="font-serif text-5xl italic leading-none">Z</span>
          </div>
        </div>
        <div className="mt-4 font-serif text-5xl text-gold drop-shadow-[0_4px_14px_rgba(0,0,0,0.8)]">
          Zucchi
        </div>
        <div className="mt-2 text-xs font-semibold uppercase tracking-[0.32em] text-champagne/88">
          Luxury Stones
        </div>
      </div>
    </div>
  );
}
