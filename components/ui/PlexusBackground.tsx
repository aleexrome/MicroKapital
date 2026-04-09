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

const COLORS = {
  bg1:    '#040d1a',
  bg2:    '#071428',
  node:   [0, 160, 255],     // cyan-blue
  nodeAlt:[80, 200, 255],    // brighter teal
  line:   [0, 120, 220],
}

export function PlexusBackground() {
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
      const count = Math.floor((width * height) / 14000)
      nodes = Array.from({ length: Math.max(count, 55) }, () => ({
        x:       Math.random() * width,
        y:       Math.random() * height,
        vx:      (Math.random() - 0.5) * 0.45,
        vy:      (Math.random() - 0.5) * 0.45,
        radius:  Math.random() * 2.2 + 1,
        opacity: Math.random() * 0.5 + 0.5,
      }))
    }

    function drawBackground() {
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

    const MAX_DIST = 160

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

          const alpha = (1 - dist / MAX_DIST) * 0.35
          const [r, g, b] = COLORS.line
          ctx!.beginPath()
          ctx!.moveTo(nodes[i].x, nodes[i].y)
          ctx!.lineTo(nodes[j].x, nodes[j].y)
          ctx!.strokeStyle = `rgba(${r},${g},${b},${alpha})`
          ctx!.lineWidth = 0.8
          ctx!.stroke()
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const [r, g, b] = node.radius > 2 ? COLORS.nodeAlt : COLORS.node

        // Outer glow
        const glow = ctx!.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 6)
        glow.addColorStop(0,   `rgba(${r},${g},${b},${node.opacity * 0.3})`)
        glow.addColorStop(1,   `rgba(${r},${g},${b},0)`)
        ctx!.beginPath()
        ctx!.arc(node.x, node.y, node.radius * 6, 0, Math.PI * 2)
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
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  )
}
