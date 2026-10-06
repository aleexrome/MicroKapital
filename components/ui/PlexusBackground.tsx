'use client'

import { useEffect, useRef } from 'react'

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
}

interface PlexusBackgroundProps {
  /** Si true, el canvas NO pinta su propio fondo oscuro — útil para
   *  dejar asomar blobs/decorados del elemento padre (dashboard glass).
   *  Si false (default), mantiene el fondo oscuro del login original. */
  transparentBg?: boolean
  /** Multiplicador del tamaño de las partículas (default 1).
   *  >1 → nodos más grandes para que se noten difuminados tras el
   *  backdrop-blur de las cards. */
  nodeScale?: number
}

const COLORS = {
  bg1:    '#040d1a',
  bg2:    '#071428',
  node:   [120, 200, 255],   // cyan-blue (más brillante)
  nodeAlt:[180, 220, 255],   // casi blanco con tinte azul
  line:   [100, 180, 255],   // más visible
}

export function PlexusBackground({ transparentBg = false, nodeScale = 1 }: PlexusBackgroundProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let width = 0
    let height = 0
    let nodes: Node[] = []

    function resize() {
      width  = canvas!.width  = window.innerWidth
      height = canvas!.height = window.innerHeight
      initNodes()
    }

    function initNodes() {
      // Menos nodos pero mas grandes para que el blur los agrande sin
      // saturar la pantalla con un enjambre denso.
      const count = Math.floor((width * height) / 22000)
      nodes = Array.from({ length: Math.max(count, 40) }, () => ({
        x:       Math.random() * width,
        y:       Math.random() * height,
        vx:      (Math.random() - 0.5) * 0.4,
        vy:      (Math.random() - 0.5) * 0.4,
        radius:  (Math.random() * 3 + 2) * nodeScale,
        opacity: Math.random() * 0.4 + 0.6,
      }))
    }

    function drawBackground() {
      // transparentBg: no pintar fondo → deja asomar lo que haya
      // debajo del canvas (blobs de color del layout).
      if (transparentBg) return

      const grad = ctx!.createLinearGradient(0, 0, width * 0.6, height)
      grad.addColorStop(0,   COLORS.bg2)
      grad.addColorStop(0.5, '#050f20')
      grad.addColorStop(1,   COLORS.bg1)
      ctx!.fillStyle = grad
      ctx!.fillRect(0, 0, width, height)

      // Subtle radial glow in centre-left
      const glow = ctx!.createRadialGradient(width * 0.3, height * 0.4, 0, width * 0.3, height * 0.4, width * 0.55)
      glow.addColorStop(0,   'rgba(0,80,180,0.18)')
      glow.addColorStop(0.5, 'rgba(0,50,130,0.08)')
      glow.addColorStop(1,   'rgba(0,0,0,0)')
      ctx!.fillStyle = glow
      ctx!.fillRect(0, 0, width, height)
    }

    const MAX_DIST = 180 * nodeScale

    function draw() {
      ctx!.clearRect(0, 0, width, height)
      drawBackground()

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > MAX_DIST) continue

          const alpha = (1 - dist / MAX_DIST) * 0.5
          const [r, g, b] = COLORS.line
          ctx!.beginPath()
          ctx!.moveTo(nodes[i].x, nodes[i].y)
          ctx!.lineTo(nodes[j].x, nodes[j].y)
          ctx!.strokeStyle = `rgba(${r},${g},${b},${alpha})`
          ctx!.lineWidth = 1.2 * nodeScale
          ctx!.stroke()
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const [r, g, b] = node.radius > 3 * nodeScale ? COLORS.nodeAlt : COLORS.node

        // Outer glow — grande para que se note difuminado tras el blur
        const glow = ctx!.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 8)
        glow.addColorStop(0,   `rgba(${r},${g},${b},${node.opacity * 0.5})`)
        glow.addColorStop(0.4, `rgba(${r},${g},${b},${node.opacity * 0.15})`)
        glow.addColorStop(1,   `rgba(${r},${g},${b},0)`)
        ctx!.beginPath()
        ctx!.arc(node.x, node.y, node.radius * 8, 0, Math.PI * 2)
        ctx!.fillStyle = glow
        ctx!.fill()

        // Core dot
        ctx!.beginPath()
        ctx!.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${r},${g},${b},${node.opacity})`
        ctx!.fill()
      }
    }

    function update() {
      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < -20)     n.x = width  + 20
        if (n.x > width + 20)  n.x = -20
        if (n.y < -20)     n.y = height + 20
        if (n.y > height + 20) n.y = -20
      }
    }

    function loop() {
      update()
      draw()
      animId = requestAnimationFrame(loop)
    }

    resize()
    loop()

    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [transparentBg, nodeScale])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
    />
  )
}
