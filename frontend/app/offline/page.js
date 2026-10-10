import Link from 'next/link';
import BotaoResetarPwa from '../../components/RegistrarPwa/BotaoResetarPwa';

export default function PaginaOffline() {
  return (
    <main
      style={{
        alignItems: 'center',
        background: 'radial-gradient(circle at 12% 14%, rgba(223, 113, 104, .15), transparent 28%), radial-gradient(circle at 88% 86%, rgba(112, 67, 104, .13), transparent 32%), #fffaf8',
        color: '#301c2e',
        display: 'flex',
        fontFamily: "'DM Sans', Arial, sans-serif",
        justifyContent: 'center',
        minHeight: '100vh',
        overflow: 'hidden',
        padding: '32px 20px',
        position: 'relative',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          background: 'linear-gradient(135deg, rgba(223, 113, 104, .16), rgba(255, 245, 239, .25))',
          border: '1px solid rgba(223, 113, 104, .12)',
          borderRadius: '50%',
          height: 360,
          left: '-170px',
          position: 'absolute',
          top: '-190px',
          width: 360,
        }}
      />
      <section
        style={{
          background: 'rgba(255, 255, 255, .84)',
          border: '1px solid rgba(93, 53, 88, .11)',
          borderRadius: 28,
          boxShadow: '0 28px 80px rgba(92, 42, 79, .12)',
          maxWidth: 540,
          padding: 'clamp(32px, 8vw, 60px)',
          position: 'relative',
          textAlign: 'center',
          width: '100%',
        }}
      >
        <div
          aria-label="AgendeAki"
          style={{ alignItems: 'center', display: 'flex', gap: 12, justifyContent: 'center', margin: '0 auto 30px' }}
        >
          <span
            aria-hidden="true"
            style={{
              alignItems: 'center',
              background: '#df7168',
              borderRadius: '50% 50% 50% 12%',
              boxShadow: '0 8px 18px rgba(198, 86, 89, .2)',
              color: '#fff',
              display: 'inline-flex',
              fontFamily: 'Georgia, serif',
              fontSize: 27,
              fontStyle: 'italic',
              fontWeight: 700,
              height: 48,
              justifyContent: 'center',
              letterSpacing: '-.16em',
              paddingRight: '.12em',
              width: 48,
            }}
          >
            a
          </span>
          <span style={{ color: '#3f1d3b', fontSize: 27, fontWeight: 700, letterSpacing: '-.07em' }}>
            agende<span style={{ color: '#df7168' }}>aki</span>
          </span>
        </div>

        <div
          style={{
            alignItems: 'center',
            background: '#fff5ef',
            border: '1px solid rgba(223, 113, 104, .18)',
            borderRadius: 999,
            color: '#a84e50',
            display: 'inline-flex',
            fontSize: 12,
            fontWeight: 700,
            gap: 8,
            letterSpacing: '.1em',
            padding: '9px 13px',
            textTransform: 'uppercase',
          }}
        >
          <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 20 20" width="16">
            <path d="M2.5 7.5a11 11 0 0 1 15 0M5.5 10.5a6.5 6.5 0 0 1 9 0M8.5 13.5a2 2 0 0 1 3 0M3 3l14 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          </svg>
          Sem conexão
        </div>

        <h1
          style={{
            color: '#3f1d3b',
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(34px, 8vw, 46px)',
            letterSpacing: '-.04em',
            lineHeight: 1.13,
            margin: '22px 0 14px',
          }}
        >
          Parece que você está offline.
        </h1>
        <p style={{ color: '#6b5969', fontSize: 16, lineHeight: 1.75, margin: '0 auto', maxWidth: 390 }}>
          Confira sua conexão com a internet. Quando ela voltar, você poderá encontrar salões e cuidar dos seus agendamentos por aqui.
        </p>

        <Link
          href="/"
          style={{
            alignItems: 'center',
            background: 'linear-gradient(110deg, #704368, #3f1d3b)',
            borderRadius: 14,
            boxShadow: '0 12px 24px rgba(63, 29, 59, .2)',
            color: '#fff',
            display: 'inline-flex',
            fontSize: 15,
            fontWeight: 700,
            gap: 10,
            justifyContent: 'center',
            marginTop: 30,
            minHeight: 52,
            padding: '0 22px',
            textDecoration: 'none',
            transition: 'transform .2s ease, box-shadow .2s ease',
          }}
        >
          Tentar novamente
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>→</span>
        </Link>

        <BotaoResetarPwa />

        <p style={{ color: '#9b8998', fontSize: 12, lineHeight: 1.5, margin: '24px 0 0' }}>
          Seus dados continuam seguros. Esta página estará aqui enquanto a conexão não volta.
        </p>
      </section>
    </main>
  );
}
