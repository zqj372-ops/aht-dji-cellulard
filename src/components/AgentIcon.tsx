interface AgentIconProps {
  src: string;
  alt: string;
  size?: 'screen' | 'list';
}

export function AgentIcon({ src, alt, size = 'screen' }: AgentIconProps) {
  return (
    <span
      className={`agent-icon-tile agent-icon-tile--${size} agent-icon-tile--white`}
      data-testid="agent-icon-tile"
    >
      <img src={src} alt={alt} width={24} height={24} />
    </span>
  );
}
