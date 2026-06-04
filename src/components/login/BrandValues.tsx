import { Award, Gem, Handshake, ShieldCheck } from "lucide-react";

const values = [
  { title: "Tradição", description: "Desde 1972", icon: ShieldCheck },
  { title: "Excelência", description: "Em cada detalhe", icon: Award },
  { title: "Preciosidade", description: "Em cada pedra", icon: Gem },
  { title: "Confiança", description: "Em cada relação", icon: Handshake }
];

export function BrandValues() {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 border-t border-gold/22 bg-black/58 px-7 py-6 backdrop-blur-md">
      <div className="mx-auto grid max-w-[920px] grid-cols-4">
        {values.map((value, index) => {
          const Icon = value.icon;
          return (
            <div
              key={value.title}
              className={`flex min-w-0 items-center gap-3 px-5 ${index > 0 ? "border-l border-gold/22" : ""}`}
            >
              <Icon className="h-8 w-8 shrink-0 text-gold" strokeWidth={1.45} />
              <div className="min-w-0">
                <div className="truncate text-[0.72rem] font-bold uppercase tracking-wide text-gold">
                  {value.title}
                </div>
                <div className="mt-1 truncate text-xs text-champagne/74">{value.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
