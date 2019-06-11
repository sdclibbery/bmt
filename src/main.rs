use termion::raw::IntoRawMode;
use termion::{color, style};
use std::io::{Write, stdout};

fn main() {
    // Enter raw mode.
    let mut stdout = stdout().into_raw_mode().unwrap();

    // Write to stdout (note that we don't use `println!`)
    writeln!(stdout, "{red}Hello {green}World{reset}\r",
            red   = color::Fg(color::Red),
            green = color::Fg(color::Green),
            reset = style::Reset).unwrap();

    // Here the destructor is automatically called, and the terminal state is restored.
}
