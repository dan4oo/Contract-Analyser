import { useState, useEffect, useRef } from 'react'

/**
 * Custom hook for typewriter effect
 * @param {string} text - The text to type out
 * @param {number} speed - Typing speed in milliseconds per character (default: 20)
 * @param {boolean} startImmediately - Whether to start typing immediately (default: true)
 * @param {number} delay - Delay before starting to type in milliseconds (default: 0)
 * @param {Function} onComplete - Callback when typing completes
 */
export function useTypewriter(text, speed = 20, startImmediately = true, delay = 0, onComplete = null) {
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const timeoutRef = useRef(null)
  const intervalRef = useRef(null)
  const onCompleteRef = useRef(onComplete)

  // Update ref when callback changes
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    // Clear any existing timeouts/intervals
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)

    if (!text || !startImmediately) {
      setDisplayedText('')
      setIsTyping(false)
      return
    }

    // Reset state
    setDisplayedText('')
    setIsTyping(false)

    // Start typing after delay
    timeoutRef.current = setTimeout(() => {
      setIsTyping(true)
      let currentIndex = 0

      intervalRef.current = setInterval(() => {
        if (currentIndex < text.length) {
          setDisplayedText(text.slice(0, currentIndex + 1))
          currentIndex++
        } else {
          setIsTyping(false)
          clearInterval(intervalRef.current)
          // Call onComplete callback
          if (onCompleteRef.current) {
            onCompleteRef.current()
          }
        }
      }, speed)
    }, delay)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [text, speed, startImmediately, delay])

  return { displayedText, isTyping }
}
