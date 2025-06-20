// src/components/ui/slider-with-input.tsx
"use client"

import * as React from "react"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"

interface SliderWithInputProps {
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  displayFormat?: (value: number) => string
  parseInput?: (input: string) => number
  className?: string
  inputWidth?: string
  sliderWidth?: string
  disabled?: boolean
  showValue?: boolean
}

const SliderWithInput = ({
  min,
  max,
  step,
  value,
  onChange,
  displayFormat = (val) => val.toString(),
  parseInput, // New prop to allow custom parsing
  className = "",
  inputWidth = "w-10",
  sliderWidth = "w-24",
  disabled = false,
  showValue = true,
}: SliderWithInputProps) => {
  const [localValue, setLocalValue] = React.useState<string>(displayFormat(value))
  const [isEditing, setIsEditing] = React.useState(false)

  // Update local value when prop value changes (but not during editing)
  React.useEffect(() => {
    if (!isEditing) {
      setLocalValue(displayFormat(value))
    }
  }, [value, displayFormat, isEditing])

  // Handle slider change
  const handleSliderChange = (newValue: number[]) => {
    onChange(newValue[0])
  }

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsEditing(true)
    setLocalValue(e.target.value)
  }

  // Handle input blur (commit the value)
  const handleInputBlur = () => {
    setIsEditing(false)
    
    let numValue: number;

    // Use custom parser if provided
    if (parseInput) {
      numValue = parseInput(localValue);
    } else {
      // Default parsing - handle percentage format
      let valueStr = localValue;
      // Remove percentage sign if present
      if (valueStr.endsWith('%')) {
        valueStr = valueStr.slice(0, -1);
      }
      
      // Parse as float
      numValue = parseFloat(valueStr);
      
      // If display format includes %, assume input is also percentage (0-100)
      // and needs to be converted to decimal (0-1)
      if (displayFormat(value).includes('%') && !isNaN(numValue)) {
        numValue = numValue / 100;
      }
    }

    if (!isNaN(numValue)) {
      // Clamp the value between min and max
      const clampedValue = Math.min(Math.max(numValue, min), max);
      // Round to nearest step if needed
      const steppedValue = step > 0 
        ? Math.round(clampedValue / step) * step 
        : clampedValue;
      
      onChange(steppedValue);
      setLocalValue(displayFormat(steppedValue));
    } else {
      // Reset to current value if input is invalid
      setLocalValue(displayFormat(value));
    }
  }

  // Handle Enter key to commit value
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setLocalValue(displayFormat(value))
      e.currentTarget.blur()
    }
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <Slider
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={handleSliderChange}
        className={`${sliderWidth}`}
      />
      
      {showValue && (
        <Input
          type="text"
          disabled={disabled}
          value={localValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          className={`${inputWidth} text-xs text-right p-1 h-6`}
        />
      )}
    </div>
  )
}

export { SliderWithInput }