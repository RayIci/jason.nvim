// Syntax checker for Jason agent programs (.asl) and project files (.mas2j).
//
// Runs with the Jason jar on the classpath, without a build step:
//   java -cp <jason jar> JasonLint.java [--stdin] <file>
//
// With --stdin the source is read from stdin, so unsaved buffers can be
// checked; <file> then only names the source in messages.
// Prints `file:line:col: error|warning: message` for the first problem (the
// parser stops there) and exits 1 when there is one.

import java.io.File;
import java.io.Reader;
import java.io.StringReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.logging.LogManager;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class JasonLint {
    private static final Pattern USER_DIRECTIVE = Pattern.compile("\\{\\s*begin\\s+(?!namespace\\b)(\\w+)");
    private static final Pattern LEXICAL = Pattern.compile("line (\\d+), column (\\d+)\\.\\s*(.*)", Pattern.DOTALL);

    public static void main(String[] args) throws Exception {
        boolean stdin = args.length == 2 && args[0].equals("--stdin");
        if (args.length != (stdin ? 2 : 1)) {
            System.err.println("usage: JasonLint [--stdin] <file.asl|file.mas2j>");
            System.exit(2);
        }
        LogManager.getLogManager().reset(); // the interpreter logs to stderr
        // Agents created for include/namespace directives would otherwise
        // start the Mind Inspector web server (and grab its port).
        jason.util.Config.get().setProperty("startWebMindInspector", "false");
        String file = args[args.length - 1];
        String source = stdin
                ? new String(System.in.readAllBytes(), StandardCharsets.UTF_8)
                : Files.readString(Path.of(file), StandardCharsets.UTF_8);
        Reader in = new StringReader(source);
        String error = file.endsWith(".mas2j") ? checkMas2j(in) : checkAsl(in, file, source);
        if (error != null) {
            System.out.println(file + ":" + error);
        }
        System.exit(error == null ? 0 : 1); // stop any interpreter threads
    }

    private static String checkAsl(Reader in, String file, String source) {
        try {
            jason.asSyntax.parser.as2j parser = new jason.asSyntax.parser.as2j(in);
            parser.setASLSource(new File(file).getName());
            jason.asSemantics.Agent ag = new jason.asSemantics.Agent();
            ag.setConsiderToAddMIForThisAgent(false); // no Mind Inspector web server
            ag.initAg();
            parser.agent(ag);
            return null;
        } catch (jason.asSyntax.parser.ParseException e) {
            jason.asSyntax.parser.Token t = e.currentToken == null ? null : e.currentToken.next;
            return t == null ? at(1, 1, firstLine(e.getMessage())) : at(t.beginLine, t.beginColumn, unexpected(t.image));
        } catch (jason.asSyntax.parser.TokenMgrError e) {
            return lexical(e.getMessage());
        } catch (NullPointerException e) {
            String userDirective = userDirective(source);
            return userDirective != null ? userDirective : at(1, 1, firstLine(e.getMessage()));
        } catch (Exception e) {
            return at(1, 1, firstLine(e.getMessage()));
        }
    }

    // The parser fails on directives a project registers in its .mas2j
    // (`directives: name = Class;`), which a single file cannot know about.
    private static String userDirective(String source) {
        String[] lines = source.split("\\R", -1);
        for (int i = 0; i < lines.length; i++) {
            Matcher m = USER_DIRECTIVE.matcher(lines[i]);
            if (m.find()) {
                return Math.max(i + 1, 1) + ":" + (m.start(1) + 1) + ": warning: unknown directive '" + m.group(1)
                        + "' (project directives from the .mas2j are not checked; the rest of the file was skipped)";
            }
        }
        return null;
    }

    private static String checkMas2j(Reader in) {
        try {
            new jason.mas2j.parser.mas2j(in).mas();
            return null;
        } catch (jason.mas2j.parser.ParseException e) {
            jason.mas2j.parser.Token t = e.currentToken == null ? null : e.currentToken.next;
            return t == null ? at(1, 1, firstLine(e.getMessage())) : at(t.beginLine, t.beginColumn, unexpected(t.image));
        } catch (jason.mas2j.parser.TokenMgrError e) {
            return lexical(e.getMessage());
        } catch (Exception e) {
            return at(1, 1, firstLine(e.getMessage()));
        }
    }

    private static String unexpected(String image) {
        return image == null || image.isEmpty() ? "unexpected end of file" : "unexpected '" + image + "'";
    }

    private static String lexical(String message) {
        Matcher m = LEXICAL.matcher(message == null ? "" : message);
        if (m.find()) {
            String detail = m.group(3).contains("<EOF>")
                    ? "unexpected end of file (unterminated string or quoted atom?)"
                    : firstLine(m.group(3));
            return at(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), detail);
        }
        return at(1, 1, firstLine(message));
    }

    private static String at(int line, int col, String message) {
        return Math.max(line, 1) + ":" + Math.max(col, 1) + ": error: " + message;
    }

    private static String firstLine(String s) {
        if (s == null) {
            return "syntax error";
        }
        return s.strip().split("\\R", 2)[0];
    }
}
