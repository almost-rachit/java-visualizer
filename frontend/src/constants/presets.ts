export interface CodePreset {
  id: string;
  name: string;
  category: 'Classroom' | 'Edge Cases' | 'Memory';
  description: string;
  code: string;
}

export const PRESETS: CodePreset[] = [
  {
    id: 'recursion',
    name: '1. Recursion & Call Stack (Factorial)',
    category: 'Classroom',
    description: 'Watches stack frames push on recursive calls and pop on base case return with callDepth tracking.',
    code: `public class Main {
    static int factorial(int n) {
        if (n <= 1) {
            return 1;
        }
        return n * factorial(n - 1);
    }

    public static void main(String[] args) {
        int num = 3;
        int result = factorial(num);
        System.out.println("Result: " + result);
    }
}`
  },
  {
    id: 'objects_arrays',
    name: '2. Objects, Arrays & Heap Pointers',
    category: 'Memory',
    description: 'Instantiates custom Point objects, allocates arrays on the Heap, and points stack variables to heap IDs.',
    code: `public class Main {
    static class Point {
        int x;
        int y;

        Point(int x, int y) {
            this.x = x;
            this.y = y;
        }
    }

    public static void main(String[] args) {
        Point p1 = new Point(10, 20);
        Point p2 = p1; // alias reference

        int[] numbers = new int[]{ 5, 10, 15 };
        numbers[1] = 99;

        System.out.println("p1.x = " + p1.x);
        System.out.println("numbers[1] = " + numbers[1]);
    }
}`
  },
  {
    id: 'string_pool',
    name: '3. String Pool vs new String()',
    category: 'Memory',
    description: 'Demonstrates String Constant Pool deduplication vs distinct Heap objects allocated with new.',
    code: `public class Main {
    public static void main(String[] args) {
        // String literal -> Constant Pool
        String s1 = "java";
        String s2 = "java";

        // Explicit new String -> regular Heap object
        String s3 = new String("java");

        boolean poolMatch = (s1 == s2); // true: same pooled address
        boolean heapMatch = (s1 == s3); // false: different addresses

        System.out.println("s1 == s2 (pooled): " + poolMatch);
        System.out.println("s1 == s3 (heap): " + heapMatch);
    }
}`
  },
  {
    id: 'infinite_loop',
    name: '4. Infinite Loop (Test Stop Button)',
    category: 'Edge Cases',
    description: 'Runs an infinite loop to test the 5-second timeout and instant child JVM destruction via the Stop button.',
    code: `public class Main {
    public static void main(String[] args) {
        System.out.println("Starting infinite loop test...");
        int counter = 0;
        while (true) {
            counter++;
            // Click the red STOP button in the toolbar to abort cleanly!
        }
    }
}`
  },
  {
    id: 'runtime_exception',
    name: '5. Runtime Exception (Index Out of Bounds)',
    category: 'Edge Cases',
    description: 'Triggers an ArrayIndexOutOfBoundsException to visualize crash step, stack trace, and plain-English cause.',
    code: `public class Main {
    public static void main(String[] args) {
        int[] scores = new int[]{ 95, 88, 72 };
        System.out.println("Reading score at index 0: " + scores[0]);

        // Attempting to access invalid index 5
        int invalid = scores[5];
        System.out.println("Invalid: " + invalid);
    }
}`
  },
  {
    id: 'compile_error',
    name: '6. Compile-Time Type Error',
    category: 'Edge Cases',
    description: 'Demonstrates real javac diagnostic collector capturing line, column, and plain-English explanation.',
    code: `public class Main {
    public static void main(String[] args) {
        int count = 10;
        // Incompatible types compiler error:
        int text = "Hello JVM Visualizer";
        System.out.println(text);
    }
}`
  }
];
