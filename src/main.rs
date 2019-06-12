extern crate termion;
use termion::raw::IntoRawMode;
use termion::{async_stdin, color, style};
use std::io::{stdout, Read, Write};
use std::time::{Duration};
use std::thread::sleep;

fn main() {
    let mut stdin = async_stdin();
    let mut stdout = stdout().into_raw_mode().unwrap();

    write!(stdout, "{}", termion::cursor::Hide).unwrap();
    stdout.flush().unwrap();

    let mut quit = false;
    while !quit {
        sleep(Duration::from_millis(100));

        writeln!(stdout, "{clear}{to1_1}{red}Hello {green}World{reset}\r",
                clear = termion::clear::All,
                to1_1 = termion::cursor::Goto(1, 1),
                red   = color::Fg(color::Red),
                green = color::Fg(color::Green),
                reset = style::Reset).unwrap();
        writeln!(stdout, "q to exit. Type stuff, use alt, and so on.",).unwrap();
        stdout.flush().unwrap();

        let mut key_bytes = [0;64];
        let bytes_read = stdin.read(&mut key_bytes).unwrap();

        for i in 0 .. bytes_read {
            let key = key_bytes[i];
            if key == b'q' || key == 3 { quit = true; }
            writeln!(stdout, "\rKey: {}", key).unwrap();
        }
        stdout.flush().unwrap();
    }

    write!(stdout, "{}", style::Reset).unwrap();
    write!(stdout, "\r{}", termion::cursor::Show).unwrap();
    stdout.flush().unwrap();
}
