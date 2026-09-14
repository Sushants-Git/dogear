import { useEffect, useRef, useState } from 'react'

/**
 * True once the element has been on screen. Link previews are fetched from the real
 * web, so a search that returns three hundred results must not fire three hundred
 * requests at people's servers — only the cards actually looked at ask for one.
 *
 * It never flips back to false: a preview already fetched should not be thrown away
 * and re-requested just because you scrolled past it.
 */
export function useInView(margin = '300px') {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (seen || !ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { rootMargin: margin }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [seen, margin])

  return [ref, seen]
}
