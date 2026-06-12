import Image from "next/image";

type BrandMarkProps = {
  size?: "large" | "compact";
};

/**
 * Marca da tela de login: brasão oficial da Zucchi.
 * A imagem (PNG com fundo transparente) já contém a palavra "Zucchi" na faixa,
 * por isso não há wordmark abaixo — a tagline "Zucchi Luxury Stones" segue no rodapé do card.
 */
export function BrandMark({ size = "compact" }: BrandMarkProps) {
  const isLarge = size === "large";

  return (
    <div className="flex flex-col items-center">
      <Image
        src="/images/brand/zucchi-logo-oficial.png"
        alt="Brasão oficial Zucchi"
        width={429}
        height={508}
        priority
        sizes="(max-width: 640px) 7rem, 9rem"
        className={`w-auto object-contain drop-shadow-[0_14px_34px_rgba(0,0,0,0.55)] ${isLarge ? "h-[8.6rem] sm:h-[9.4rem]" : "h-[6rem]"}`}
      />
    </div>
  );
}
