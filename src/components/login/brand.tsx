import { Crown, Wrench } from "lucide-react";

type BrandMarkProps = {
  size?: "large" | "compact";
};

export function BrandMark({ size = "compact" }: BrandMarkProps) {
  const isLarge = size === "large";

  return (
    <div className="flex flex-col items-center">
      <div className={`relative grid place-items-center ${isLarge ? "h-[6.8rem] w-[6.8rem]" : "h-20 w-20"}`}>
        <Crown
          className={`absolute top-0 z-10 text-gold drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)] ${
            isLarge ? "h-7 w-7" : "h-6 w-6"
          }`}
          strokeWidth={1.45}
        />
        <div
          className={`crest-shield grid place-items-center border border-gold/58 bg-gradient-to-br from-[#142c38] via-[#0d1d24] to-[#050707] shadow-[0_16px_38px_rgba(0,0,0,0.42)] ${
            isLarge ? "h-[5.9rem] w-[4.85rem]" : "h-16 w-14"
          }`}
        >
          <div
            className={`crest-shield relative grid place-items-center border border-gold/38 bg-black/30 text-gold ${
              isLarge ? "h-[4.45rem] w-[3.55rem]" : "h-12 w-10"
            }`}
          >
            <span className={`font-serif italic leading-none ${isLarge ? "text-5xl" : "text-3xl"}`}>Z</span>
            <Wrench className="absolute bottom-3 right-3 h-3.5 w-3.5 text-champagne/65" strokeWidth={1.4} />
          </div>
        </div>
      </div>
      <div className={`font-serif leading-none text-gold drop-shadow ${isLarge ? "mt-1 text-5xl" : "mt-1 text-3xl"}`}>
        Zucchi
      </div>
      <div
        className={`mt-2 font-semibold uppercase text-champagne/88 ${
          isLarge ? "text-[0.68rem] tracking-[0.34em]" : "text-[0.62rem] tracking-[0.26em]"
        }`}
      >
        Stones Luxury
      </div>
    </div>
  );
}
