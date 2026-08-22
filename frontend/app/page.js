import AlternadorTema from '../components/AlternadorTema/AlternadorTema';
import BotaoNavegacao from '../components/BotaoNavegacao/BotaoNavegacao';
import CartaoInformacao from '../components/CartaoInformacao/CartaoInformacao';

const recursos = [
  {
    icone: '⌖',
    titulo: 'Salões perto de você',
    descricao: 'Descubra espaços que combinam com seu estilo e estão a poucos passos de distância.',
  },
  {
    icone: '✦',
    titulo: 'Escolha com calma',
    descricao: 'Compare serviços, profissionais, avaliações e valores antes de decidir.',
  },
  {
    icone: '◷',
    titulo: 'Seu tempo valorizado',
    descricao: 'Reserve seu horário em poucos toques e acompanhe cada agendamento.',
  },
];

export default function PaginaInicial() {
  return (
    <main>
      <section className="apresentacao" id="inicio">
        <header className="cabecalho conteudo-limitado">
          <a aria-label="AgendeAki: página inicial" className="marca" href="#inicio">
            <span aria-hidden="true" className="marca__simbolo">a</span>
            <span>agende<span>aki</span></span>
          </a>

          <nav aria-label="Navegação principal" className="navegacao-principal">
            <a href="#como-funciona">Como funciona</a>
            <a href="#para-saloes">Para salões</a>
          </nav>

          <AlternadorTema />
        </header>

        <div className="conteudo-limitado apresentacao__conteudo">
          <div className="apresentacao__texto">
            <p className="selo"><span aria-hidden="true">✦</span> Beleza no seu ritmo</p>
            <h1>Seu próximo momento de <em>cuidado</em> começa aqui.</h1>
            <p className="apresentacao__descricao">
              Encontre profissionais incríveis, escolha o serviço perfeito e transforme a rotina em autocuidado.
            </p>
            <div className="apresentacao__acoes">
              <BotaoNavegacao destino="/cliente" destaque texto="Entrar como cliente" />
              <BotaoNavegacao destino="/salao" texto="Acessar meu salão" />
            </div>
          </div>

          <div aria-label="Exemplo de agendamento confirmado" className="composicao-visual" role="img">
            <div className="brilho brilho--um" />
            <div className="brilho brilho--dois" />
            <div className="cartao-agendamento">
              <div className="cartao-agendamento__topo">
                <span className="cartao-agendamento__marca">a</span>
                <span className="etiqueta-confirmado"><i /> Confirmado</span>
              </div>
              <div className="perfil-profissional">
                <div className="perfil-profissional__foto">LM</div>
                <div>
                  <p>Seu horário com</p>
                  <strong>Larissa Martins</strong>
                  <span>Especialista em cortes</span>
                </div>
              </div>
              <div className="detalhes-agendamento">
                <div><span>Data</span><strong>18 de agosto</strong></div>
                <div><span>Horário</span><strong>14:30</strong></div>
              </div>
              <div className="salon-miniatura"><span aria-hidden="true">✦</span><div><strong>Studio Aurora</strong><small>Jardins · São Paulo</small></div></div>
            </div>
            <div className="selo-flutuante"><span aria-hidden="true">♡</span><strong>Tempo para você</strong></div>
          </div>
        </div>
      </section>

      <section className="recursos conteudo-limitado" id="como-funciona">
        <div className="titulo-secao">
          <p className="sobretitulo">Simples, do seu jeito</p>
          <h2>Agendar ficou tão leve quanto se sentir bem.</h2>
        </div>
        <div className="grade-recursos">
          {recursos.map((recurso) => (
            <CartaoInformacao key={recurso.titulo} {...recurso} />
          ))}
        </div>
      </section>

      <section className="chamada-salao" id="para-saloes">
        <div className="conteudo-limitado chamada-salao__conteudo">
          <div>
            <p className="sobretitulo">Para quem faz beleza acontecer</p>
            <h2>Seu salão merece uma agenda tão especial quanto seu trabalho.</h2>
          </div>
          <BotaoNavegacao destino="/salao" destaque texto="Conhecer a área do salão" />
        </div>
      </section>

      <footer className="rodape conteudo-limitado">
        <span className="marca marca--rodape"><span aria-hidden="true" className="marca__simbolo">a</span> agende<span>aki</span></span>
        <p>Momentos de cuidado, mais perto de você.</p>
      </footer>
    </main>
  );
}
