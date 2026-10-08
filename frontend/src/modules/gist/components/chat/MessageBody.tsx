import { parseMentions } from '../../services/chat-channels';

/** Message text with tappable @mentions (open that player's profile). */
export function MessageBody({ body, onMention, onDark = false }: { readonly body: string; readonly onMention: (handle: string) => void; readonly onDark?: boolean }) {
  return (
    <>
      {parseMentions(body).map((part, index) =>
        part.kind === 'text' ? (
          <span key={index}>{part.text}</span>
        ) : (
          <button key={index} type="button" onClick={() => onMention(part.handle)} className={onDark ? 'font-bold text-danfo underline-offset-2 hover:underline' : 'font-bold text-cobalt underline-offset-2 hover:underline'}>
            @{part.handle}
          </button>
        ),
      )}
    </>
  );
}
