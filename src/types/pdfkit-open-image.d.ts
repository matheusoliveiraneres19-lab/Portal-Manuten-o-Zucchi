/**
 * Complemento de tipos para `pdfkit`: `doc.openImage()`.
 *
 * O método existe no pdfkit desde a 0.11 (`lib/mixins/images.js`) mas não está
 * declarado em `@types/pdfkit`, que só expõe `image()`.
 *
 * Ele importa para o relatório de aderência: `doc.image(buffer, …)` EMBUTE o PNG
 * de novo a cada chamada, e a logo aparece no cabeçalho de todas as páginas — o
 * arquivo saía com 3,3 MB. Com `openImage`, o PNG vira um XObject único que as
 * páginas apenas referenciam (mesmo relatório: 328 KB).
 *
 * Declarado aqui, e não com `any` no ponto de uso, para que a chamada continue
 * verificada pelo compilador.
 */
declare namespace PDFKit {
  /** Imagem já decodificada e registrada no documento, pronta para reuso. */
  interface OpenedImage {
    width: number;
    height: number;
  }

  interface PDFDocument {
    /** Decodifica e registra a imagem UMA vez; o retorno é aceito por `image()`. */
    openImage(src: Buffer | ArrayBuffer | string): OpenedImage;
  }
}

declare namespace PDFKit.Mixins {
  interface PDFImage {
    image(src: PDFKit.OpenedImage, x?: number, y?: number, options?: ImageOption): this;
    image(src: PDFKit.OpenedImage, options?: ImageOption): this;
  }
}
