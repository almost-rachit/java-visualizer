package com.jviz.service;

import com.jviz.model.CompileResult;
import com.jviz.model.CompileResult.CompileError;
import com.jviz.model.CompileResult.CompileStage;
import org.springframework.stereotype.Service;

import javax.tools.*;
import java.io.*;
import java.net.URI;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;

/**
 * Real compilation pipeline using javax.tools.JavaCompiler.
 * Includes pre-compile security scanning for classroom cloud deployment.
 * Captures lexing/parsing status, bytecode generation, and exact diagnostics.
 */
@Service
public class CompilationService {

    // Dangerous APIs blocked in shared classroom environment
    private static final List<SecurityRule> SECURITY_RULES = List.of(
        new SecurityRule(Pattern.compile("\\bProcessBuilder\\b"), "ProcessBuilder"),
        new SecurityRule(Pattern.compile("\\bRuntime\\s*\\.\\s*getRuntime\\b"), "Runtime.getRuntime"),
        new SecurityRule(Pattern.compile("\\bjava\\s*\\.\\s*io\\s*\\.\\s*File\\b"), "java.io.File"),
        new SecurityRule(Pattern.compile("\\bjava\\s*\\.\\s*nio\\s*\\.\\s*file\\b"), "java.nio.file"),
        new SecurityRule(Pattern.compile("\\bjava\\s*\\.\\s*net\\b"), "java.net."),
        new SecurityRule(Pattern.compile("\\bSystem\\s*\\.\\s*exit\\b"), "System.exit"),
        new SecurityRule(Pattern.compile("\\bClassLoader\\b"), "ClassLoader")
    );

    private record SecurityRule(Pattern pattern, String label) {}
    private record SecurityViolation(int line, int column, String matchedApi) {}

    /**
     * Compiles Java source code into a .class file inside workDir.
     * First runs a pre-compile security scan to protect cloud containers.
     *
     * @param sourceCode  raw Java source text
     * @param className   simple class name (e.g. "Main")
     * @param workDir     directory to write .class files into
     * @return CompileResult with stages, errors, and classFilePath
     */
    public CompileResult compile(String sourceCode, String className, Path workDir) throws IOException {
        // ── Step 0: Pre-compile security scan ──
        List<SecurityViolation> violations = scanSecurity(sourceCode);
        if (!violations.isEmpty()) {
            List<CompileError> securityErrors = new ArrayList<>();
            for (SecurityViolation v : violations) {
                securityErrors.add(new CompileError(
                    v.line(),
                    v.column(),
                    "Classroom Security Policy: Access to '" + v.matchedApi() + "' is restricted.",
                    "For safety in a shared classroom cloud environment, system APIs such as process creation, arbitrary file I/O, networking, and system termination are disabled. Focus on algorithms, memory structures, and object orientation!",
                    "ERROR"
                ));
            }
            return new CompileResult(
                false,
                List.of(
                    new CompileStage("Security Check", "FAILED", "Blocked restricted API: " + violations.get(0).matchedApi()),
                    new CompileStage("Lexing/Parsing", "SKIPPED", "Pre-compile security check failed"),
                    new CompileStage("Bytecode Generation", "SKIPPED", "Blocked by security policy")
                ),
                securityErrors,
                null
            );
        }

        Files.createDirectories(workDir);

        // Write source to disk so we can reference it
        Path sourceFile = workDir.resolve(className + ".java");
        Files.writeString(sourceFile, sourceCode);

        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            return new CompileResult(false,
                List.of(new CompileStage("Init", "FAILED", "No system Java compiler found. Ensure a JDK (not JRE) is on the PATH.")),
                List.of(), null);
        }

        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        StandardJavaFileManager fileManager = compiler.getStandardFileManager(diagnostics, Locale.ENGLISH, null);

        // Set output directory
        fileManager.setLocation(StandardLocation.CLASS_OUTPUT, List.of(workDir.toFile()));

        List<CompileStage> stages = new ArrayList<>();
        stages.add(new CompileStage("Security Check", "OK", "Passed classroom safety verification"));
        stages.add(new CompileStage("Init", "OK", "JavaCompiler obtained from ToolProvider"));

        // Create compilation unit from the source string
        JavaFileObject sourceObj = new InMemoryJavaSource(className, sourceCode);

        // Parse stage
        stages.add(new CompileStage("Lexing/Parsing", "PENDING", "Submitting source to compiler…"));

        JavaCompiler.CompilationTask task = compiler.getTask(
            null,           // writer (use default)
            fileManager,
            diagnostics,
            List.of("-g", "-parameters"),  // include debug info + parameter names
            null,           // annotation processors
            List.of(sourceObj)
        );

        boolean success = task.call();

        // Classify diagnostics
        List<CompileError> errors = new ArrayList<>();
        boolean hasSyntaxError = false;
        for (Diagnostic<? extends JavaFileObject> d : diagnostics.getDiagnostics()) {
            String explanation = generateExplanation(d);
            errors.add(new CompileError(
                d.getLineNumber(),
                d.getColumnNumber(),
                d.getMessage(Locale.ENGLISH),
                explanation,
                d.getKind().name()
            ));
            if (d.getKind() == Diagnostic.Kind.ERROR) {
                hasSyntaxError = true;
            }
        }

        if (hasSyntaxError) {
            stages.set(2, new CompileStage("Lexing/Parsing", "FAILED", "Source contains syntax or semantic errors"));
            stages.add(new CompileStage("Bytecode Generation", "SKIPPED", "Cannot generate bytecode due to errors"));
        } else {
            stages.set(2, new CompileStage("Lexing/Parsing", "OK", "Source parsed successfully"));
            Path classFile = workDir.resolve(className + ".class");
            if (Files.exists(classFile)) {
                long size = Files.size(classFile);
                stages.add(new CompileStage("Bytecode Generation", "OK",
                    String.format("%s.class generated (%d bytes)", className, size)));
            } else {
                stages.add(new CompileStage("Bytecode Generation", "OK", className + ".class generated"));
            }
        }

        fileManager.close();

        String classFilePath = success ? workDir.resolve(className + ".class").toString() : null;
        return new CompileResult(success, stages, errors, classFilePath);
    }

    private List<SecurityViolation> scanSecurity(String sourceCode) {
        List<SecurityViolation> violations = new ArrayList<>();
        String[] lines = sourceCode.split("\\r?\\n");

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            // Skip pure line comments
            String trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
                continue;
            }

            for (SecurityRule rule : SECURITY_RULES) {
                Matcher matcher = rule.pattern().matcher(line);
                if (matcher.find()) {
                    int col = matcher.start() + 1;
                    violations.add(new SecurityViolation(i + 1, col, rule.label()));
                }
            }
        }
        return violations;
    }

    /**
     * Generate a plain-English explanation for a compiler diagnostic.
     */
    private String generateExplanation(Diagnostic<? extends JavaFileObject> d) {
        String msg = d.getMessage(Locale.ENGLISH).toLowerCase();

        if (msg.contains("cannot find symbol")) {
            return "The compiler cannot find a variable, method, or class you referenced. Check for typos or missing imports.";
        } else if (msg.contains("';' expected")) {
            return "You are missing a semicolon at the end of a statement.";
        } else if (msg.contains("incompatible types")) {
            return "You are trying to assign a value of one type to a variable of an incompatible type. Check your type conversions.";
        } else if (msg.contains("unreachable statement")) {
            return "This code can never be executed because a previous statement always exits the method (e.g., a return or throw).";
        } else if (msg.contains("variable") && msg.contains("might not have been initialized")) {
            return "You are using a local variable before assigning it a value. Java requires all local variables to be initialized before use.";
        } else if (msg.contains("class") && msg.contains("is public") && msg.contains("should be declared")) {
            return "A public class must be in a file with the same name as the class.";
        } else if (msg.contains("method") && msg.contains("already defined")) {
            return "You have two methods with the same name and parameter types in the same class.";
        } else if (msg.contains("illegal start of expression")) {
            return "The compiler found something unexpected. Check for mismatched braces, missing operators, or incorrect syntax.";
        } else if (msg.contains("not a statement")) {
            return "This line does not form a valid Java statement. Perhaps you meant to call a method or assign a value.";
        } else if (msg.contains("reached end of file while parsing")) {
            return "The file ended before all braces or blocks were closed. You are missing a closing '}'.";
        }

        return "Compiler error at line " + d.getLineNumber() + ": " + d.getMessage(Locale.ENGLISH);
    }

    /**
     * In-memory JavaFileObject so we don't strictly need the file on disk for compilation.
     */
    private static class InMemoryJavaSource extends SimpleJavaFileObject {
        private final String code;

        InMemoryJavaSource(String className, String code) {
            super(URI.create("string:///" + className.replace('.', '/') + Kind.SOURCE.extension), Kind.SOURCE);
            this.code = code;
        }

        @Override
        public CharSequence getCharContent(boolean ignoreEncodingErrors) {
            return code;
        }
    }
}
