import { useState, useCallback } from 'react'

export function useGenerationProgress() {
  const [progress, setProgress] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)

  const startGeneration = useCallback(() => {
    setIsGenerating(true)
    setProgress(0)
  }, [])

  const updateProgress = useCallback((value: number) => {
    setProgress(Math.min(Math.max(value, 0), 100))
  }, [])

  const finishGeneration = useCallback(() => {
    setProgress(100)
    setTimeout(() => {
      setIsGenerating(false)
      setProgress(0)
    }, 1000)
  }, [])

  const cancelGeneration = useCallback(() => {
    setIsGenerating(false)
    setProgress(0)
  }, [])

  return {
    progress,
    isGenerating,
    startGeneration,
    updateProgress,
    finishGeneration,
    cancelGeneration
  }
} 