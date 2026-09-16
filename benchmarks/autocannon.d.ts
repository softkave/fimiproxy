declare module 'autocannon' {
  interface AutocannonResult {
    requests: {average: number};
    latency: {average: number};
    throughput: {average: number};
    errors: number;
    timeouts: number;
  }

  interface AutocannonOptions {
    url: string;
    connections?: number;
    duration?: number;
    headers?: Record<string, string>;
  }

  function autocannon(opts: AutocannonOptions): Promise<AutocannonResult>;
  export default autocannon;
}
