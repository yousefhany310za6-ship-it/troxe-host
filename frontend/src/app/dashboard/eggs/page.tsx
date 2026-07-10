"use client";

import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { Egg, Container, Terminal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface EggType {
  id: string;
  name: string;
  nest_name: string;
  docker_image: string;
  startup_command: string;
  description: string | null;
}

export default function EggsPage() {
  const { data, error, isLoading } = useSWR<{ eggs: EggType[] }>(
    "/api/v1/eggs",
    (url) => fetchApi<{ eggs: EggType[] }>(url)
  );

  const eggs = data?.eggs ?? [];

  const grouped = eggs.reduce<Record<string, EggType[]>>((acc, egg) => {
    const nest = egg.nest_name;
    if (!acc[nest]) acc[nest] = [];
    acc[nest].push(egg);
    return acc;
  }, {});

  const nestNames = Object.keys(grouped).sort();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Eggs</h1>
        <p className="text-muted-foreground">
          Browse available egg configurations
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 space-y-4">
                <div className="h-5 bg-secondary rounded w-1/4" />
                <div className="h-16 bg-secondary rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">
              Failed to load eggs. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : nestNames.length > 0 ? (
        <div className="space-y-6">
          {nestNames.map((nestName) => (
            <div key={nestName} className="space-y-3">
              <h2 className="text-lg font-semibold text-muted-foreground">
                {nestName}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {grouped[nestName].map((egg) => (
                  <Card key={egg.id}>
                    <CardContent className="p-6 space-y-3">
                      <div className="flex items-center gap-2">
                        <Egg className="h-4 w-4 text-purple-400" />
                        <h3 className="font-semibold">{egg.name}</h3>
                      </div>
                      {egg.description && (
                        <p className="text-sm text-muted-foreground">
                          {egg.description}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Container className="h-3.5 w-3.5" />
                        <span className="font-mono text-xs">
                          {egg.docker_image}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Terminal className="h-3.5 w-3.5" />
                        <span className="font-mono text-xs truncate">
                          {egg.startup_command}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Egg className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              No eggs available
            </h3>
            <p className="text-muted-foreground">
              No egg configurations have been set up yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
