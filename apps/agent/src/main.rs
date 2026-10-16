// The PassBundle desktop agent: a tray app with no windows. See README.md and
// DESIGN.md, "Desktop agent".
//
//   passbundle-agent             runs in the tray (one per signed-in user)
//   passbundle-agent --update    installs a newer signed release, if there is one
//   passbundle-agent --version

// A tray app: no console window on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod brand {
    include!(concat!(env!("OUT_DIR"), "/brand.rs"));
}
#[allow(dead_code)] // Used by the native-messaging host, next.
mod channel;
mod config;
mod instance;
#[allow(dead_code)] // Used by the native-messaging host, next.
mod protocol;
mod tray;
mod update;
mod version;

use std::process::ExitCode;

use config::Config;
use version::Version;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        [] => run_tray(),
        ["--version"] => {
            println!("{} agent {}", brand::NAME, Version::current());
            ExitCode::SUCCESS
        }
        ["--update"] => run_update(),
        _ => {
            eprintln!("usage: {} [--update | --version]", env!("CARGO_PKG_NAME"));
            ExitCode::from(2)
        }
    }
}

fn run_tray() -> ExitCode {
    let Some(_lock) = instance::acquire() else {
        // Already running for this user.
        return ExitCode::SUCCESS;
    };
    if let Ok(exe) = std::env::current_exe() {
        update::clean_up(&exe);
    }
    tray::run(Config::load())
}

/// Run by the installer's scheduled task (Windows) or launch daemon (macOS),
/// with the rights to replace the installed agent.
fn run_update() -> ExitCode {
    let config = Config::load();
    if !config.updates {
        println!("Updates are turned off by policy.");
        return ExitCode::SUCCESS;
    }
    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(e) => {
            eprintln!("can't find the installed agent: {e}");
            return ExitCode::FAILURE;
        }
    };
    let base = format!("https://{}/agent", brand::DOMAIN);
    match update::run(&base, brand::UPDATE_KEY, Version::current(), &exe) {
        Ok(Some(version)) => {
            println!("Installed {} agent {version}.", brand::NAME);
            ExitCode::SUCCESS
        }
        Ok(None) => {
            println!(
                "{} agent {} is up to date.",
                brand::NAME,
                Version::current()
            );
            ExitCode::SUCCESS
        }
        Err(update::UpdateError::NoKey) => {
            println!("This build doesn't update itself.");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("Update failed: {e}");
            ExitCode::FAILURE
        }
    }
}
