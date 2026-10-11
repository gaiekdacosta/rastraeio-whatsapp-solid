/** Símbolo da Solid: "S" geométrico em bloco, com o traço do meio em diagonal. */
export function SolidMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="solid-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <path d="M28 6.5H7.5V14L24.5 18V25.5H4" fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="miter" strokeMiterlimit="10" />
    </svg>
  )
}

/** Marca da Solid; com `empresa`, o nome da empresa do usuário aparece ao lado, no lugar do subtítulo. */
export function BrandLogo({ className = '', empresa = '' }: { className?: string; empresa?: string }) {
  return (
    <div className={`brand ${className}`.trim()}>
      <SolidMark />
      <div className="brand-text">
        <h1 className="brand-wordmark">
          <span className="brand-name">Solid</span>
          <span className="brand-tagline">Marketing Digital</span>
        </h1>
        {!empresa && <p>Rastreio WhatsApp · leads e atendimento</p>}
      </div>
      {empresa && (
        <div className="brand-client">
          <span className="brand-client-name" title={empresa}>
            {empresa}
          </span>
          <span className="brand-client-sub">Rastreio WhatsApp · leads e atendimento</span>
        </div>
      )}
    </div>
  )
}
