import type { BookDocument, BookTextBlock } from './BookDocument';

const SAMPLE_PARAGRAPHS = [
  'A chuva começou antes do anoitecer, fina o bastante para quase desaparecer contra a janela. Sobre a mesa, o livro permanecia aberto, quieto, como se esperasse que alguém voltasse exatamente à frase interrompida.',
  'No quarto não havia relógio. O tempo era medido pelo som das gotas, pelo calor que diminuía na xícara e pelo peso diferente que cada página adquiria depois de lida.',
  'Quando a mão alcançou o canto direito da folha, o papel cedeu primeiro num ponto pequeno. Depois a curva correu pela superfície inteira, levando a luz consigo e escondendo por um instante as palavras que estavam por vir.',
  'Era esse pequeno intervalo que tornava a leitura especial: não apenas descobrir o texto seguinte, mas atravessar fisicamente o espaço entre duas páginas.',
  'Lá fora, a rua estava vazia. Dentro, cada parágrafo parecia ocupar um lugar próprio, com margens largas e tinta suave, sem competir com o ambiente ao redor.',
  'O livro não precisava imitar todas as imperfeições do mundo real. Bastava responder como um objeto convincente, obedecer ao toque e desaparecer da atenção assim que a história começasse a funcionar.',
  'Uma página muito brilhante lembraria uma tela. Uma página borrada demais lembraria uma fotografia ruim. O equilíbrio estava em deixar a tecnologia presente apenas quando ela ajudasse a leitura.',
  'A próxima folha foi virada mais devagar. Perto dos dedos surgiram pequenas tensões no papel, quase invisíveis. A lombada permaneceu firme enquanto a extremidade livre descrevia um arco sobre o centro do livro.',
  'Ao pousar do outro lado, toda a movimentação cessou. Restaram somente duas páginas paradas e o silêncio necessário para continuar.',
  'Nenhum menu deveria exigir atenção naquele momento. Ferramentas podiam existir nas bordas, discretas, esperando serem chamadas e desaparecendo de novo quando deixassem de ser úteis.',
  'A leitura digital não precisava ser uma coluna infinita rolando para cima. Também podia ter ritmo, direção, peso visual e a pequena cerimônia de avançar uma folha por vez.',
  'E assim o protótipo deixou de ser apenas uma superfície desenhada na tela. Aos poucos, tornou-se um lugar onde arquivos comuns podiam adquirir a presença de um livro.'
];

export function createSampleBookDocument(): BookDocument {
  const blocks: BookTextBlock[] = [
    { id: 'sample-heading-1', kind: 'heading', text: 'A Sala de Leitura' },
    ...SAMPLE_PARAGRAPHS.map((text, index): BookTextBlock => ({
      id: `sample-${String(index + 1).padStart(3, '0')}`,
      kind: 'paragraph',
      text
    })),
    { id: 'sample-heading-2', kind: 'heading', text: 'Depois da Chuva' },
    ...SAMPLE_PARAGRAPHS.slice().reverse().map((text, index): BookTextBlock => ({
      id: `sample-b-${String(index + 1).padStart(3, '0')}`,
      kind: 'paragraph',
      text
    }))
  ];

  return {
    id: 'sample-reading-room',
    metadata: { title: 'A Sala de Leitura', author: 'Book of Short Stories' },
    chapters: [{ id: 'sample-chapter', title: 'A Sala de Leitura', blocks }]
  };
}
