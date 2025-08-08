// src/components/ui/searchable-select.tsx

import React, { useState, useEffect, useRef } from 'react';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ name: string }>;
  placeholder?: string;
  className?: string;
}

const SearchableSelect = ({
  value,
  onValueChange,
  options,
  placeholder = "Select an option",
  className
}: SearchableSelectProps) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredOptions = options.filter((option) =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            !value && "text-muted-foreground",
            className
          )}
        >
          {value
            ? options.find((option) => option.name === value)?.name
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput
            placeholder={`Search ${placeholder.toLowerCase()}...`}
            value={searchTerm}
            onValueChange={setSearchTerm}
            className="h-9"
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {filteredOptions.map((option) => (
              <CommandItem
                key={option.name}
                value={option.name}
                onSelect={() => {
                  onValueChange(option.name);
                  setOpen(false);
                  setSearchTerm("");
                }}
                className="cursor-pointer"
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === option.name ? "opacity-100" : "opacity-0"
                  )}
                />
                {option.name}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SearchableSelect;