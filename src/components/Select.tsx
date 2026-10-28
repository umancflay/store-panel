import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

// Panelin kendi açılır menüsü. Tarayıcının <select>'i yerine kullanılır; aynı şekilde yazılır:
//   <Select className="select" value={x} onChange={(e) => setX(e.target.value)}><option value="a">A</option></Select>
// Menü sayfanın üstünde açılır (kartın içinde kesilmez), klavyeyle de kullanılır (↑ ↓ Enter Esc, harfle atlama).

interface Opt {
  value: string
  label: string
  disabled?: boolean
}

// <option> çocuklarını düz listeye çevirir (map ve <>…</> içindekiler dahil)
function readOptions(children: ReactNode): Opt[] {
  const out: Opt[] = []
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return
    const props = c.props as { value?: string | number; children?: ReactNode; disabled?: boolean }
    if (c.type === 'option') {
      const label = Children.toArray(props.children).join('')
      out.push({ value: String(props.value ?? label), label, disabled: props.disabled })
    } else if (props.children) out.push(...readOptions(props.children))
  })
  return out
}

export default function Select({
  value,
  onChange,
  children,
  className = 'select',
  style,
  id,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: string | number | undefined
  onChange: (e: { target: { value: string } }) => void
  children: ReactNode
  className?: string
  style?: CSSProperties
  id?: string
  disabled?: boolean
  'aria-label'?: string
}) {
  const options = readOptions(children)
  const current = options.find((o) => o.value === String(value))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; max: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const listId = useId()

  const place = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = below < 220 && above > below
    setPos({ left: r.left, top: up ? r.top - 6 : r.bottom + 6, width: r.width, up, max: Math.min(320, up ? above : below) })
  }

  useLayoutEffect(() => {
    if (open) place()
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // Seçili satır görünsün. Sadece menünün kendisi kayar (scrollIntoView sayfayı da kaydırıp menüyü kapatıyordu).
  useEffect(() => {
    const m = menu.current
    const row = m?.querySelector<HTMLElement>('[data-active="true"]')
    if (!m || !row) return
    if (row.offsetTop < m.scrollTop) m.scrollTop = row.offsetTop - 6
    else if (row.offsetTop + row.offsetHeight > m.scrollTop + m.clientHeight) m.scrollTop = row.offsetTop + row.offsetHeight - m.clientHeight + 6
  }, [open, active, pos])

  const show = () => {
    if (disabled) return
    setActive(Math.max(0, options.findIndex((o) => o.value === String(value))))
    setOpen(true)
  }
  const pick = (o: Opt) => {
    if (o.disabled) return
    setOpen(false)
    btn.current?.focus()
    if (o.value !== String(value)) onChange({ target: { value: o.value } })
  }
  const move = (d: number) => {
    let i = active
    for (let n = 0; n < options.length; n++) {
      i = (i + d + options.length) % options.length
      if (!options[i].disabled) break
    }
    setActive(i)
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        show()
      }
      return
    }
    if (e.key === 'Escape' || e.key === 'Tab') setOpen(false)
    else if (e.key === 'ArrowDown') (e.preventDefault(), move(1))
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1))
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (options[active]) pick(options[active])
    } else if (e.key.length === 1) {
      // Harfe basınca o harfle başlayan bir sonraki seçeneğe atla
      const k = e.key.toLocaleLowerCase('tr')
      const i = options.findIndex((o, n) => n > active && o.label.toLocaleLowerCase('tr').startsWith(k))
      const j = i >= 0 ? i : options.findIndex((o) => o.label.toLocaleLowerCase('tr').startsWith(k))
      if (j >= 0) setActive(j)
    }
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        id={id}
        className={`${className} sel-btn${open ? ' open' : ''}`}
        style={style}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
      >
        <span className="sel-value">{current?.label ?? '—'}</span>
        <ChevronDown size={14} className="sel-chev" aria-hidden />
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={menu}
            id={listId}
            role="listbox"
            className={`sel-menu${pos.up ? ' up' : ''}`}
            style={{
              left: Math.min(pos.left, window.innerWidth - Math.max(pos.width, 180) - 8),
              top: pos.up ? undefined : pos.top,
              bottom: pos.up ? window.innerHeight - pos.top : undefined,
              minWidth: Math.max(pos.width, 180),
              maxHeight: pos.max,
            }}
          >
            {options.map((o, i) => (
              <div
                key={o.value + i}
                role="option"
                aria-selected={o.value === String(value)}
                aria-disabled={o.disabled}
                data-active={i === active}
                className={`sel-opt${o.value === String(value) ? ' on' : ''}${o.disabled ? ' off' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
              >
                <span>{o.label}</span>
                {o.value === String(value) && <Check size={14} aria-hidden />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
