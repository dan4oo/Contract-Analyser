import { useTypewriter } from '../hooks/useTypewriter'
import './TypewriterText.css'

export function TypewriterText({ text, speed = 20, className = '', startImmediately = true, delay = 0, onComplete = null }) {
  const { displayedText, isTyping } = useTypewriter(text, speed, startImmediately, delay, onComplete)

  if (!text) return null

  return (
    <span className={`typewriter-text ${className}`}>
      {displayedText}
      {isTyping && <span className="typewriter-cursor">|</span>}
    </span>
  )
}
